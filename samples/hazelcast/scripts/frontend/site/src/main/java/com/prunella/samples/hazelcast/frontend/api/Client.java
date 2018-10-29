    package com.prunella.samples.hazelcast.frontend.api;

    import com.hazelcast.core.IMap;
    import com.hazelcast.core.HazelcastInstance;
    import com.hazelcast.client.HazelcastClient;
    import com.hazelcast.client.config.ClientConfig;
    import com.hazelcast.config.GroupConfig;
    import com.hazelcast.client.config.ClientNetworkConfig;
    import java.nio.file.StandardWatchEventKinds;
    import java.nio.file.WatchEvent;
    import java.nio.file.WatchKey;
    import java.nio.file.WatchService;
    import java.nio.file.Path;
    import java.nio.file.Paths;
    import java.nio.file.FileSystem;
    import java.nio.file.FileSystems;
    import java.util.Set;
    import java.util.HashSet;
    import java.util.Iterator;
    import java.io.BufferedReader;
    import java.io.File;
    import java.io.FileReader;
    import java.io.IOException;


    public class Client {
        private static Thread thread;
        private static ConfigWatcher configWatcher;
        private static String configName;
        private static final Object lock = new Object();
        private static Set<String> members = new HashSet<>();
        private static HazelcastInstance client;

        public static class ConfigWatcher implements Runnable{
    
            private String name;
            private WatchService watcher;
            private Boolean signalled = false;
            private WatchKey key;
            public ConfigWatcher(WatchService watcher, String name) {
                this.watcher = watcher;
                this.name = name;
            }

            public void setSignal() throws java.io.IOException, java.lang.InterruptedException {
                this.signalled = true;
                if(this.key != null)
                    this.key.cancel();
                // close
                if(this.watcher != null)
                    this.watcher.close();
            }

            @Override
            public void run() {
                try {
                    // get the first event before looping
                    this.key = this.watcher.take();
                    while(this.signalled == false && this.key != null) {
                        for (WatchEvent event : this.key.pollEvents()) {
                            try {
                                if(event.context().toString().equals(this.name)) {
                                    // System.out.printf("Received %s event for file: %s\n",
                                    // event.kind(), event.context());    
                                    // System.out.println("Refreshing Discovery Configuration.");
                                    // refresh it
                                    Client.refresh();    
                                }   
                            }
                            catch(Exception ex) {
                                ex.printStackTrace();
                            }
                        }
                        this.key.reset();
                        this.key = this.watcher.take();   
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }

        private static Set<String> readEntries() throws java.io.IOException {
            String line;
            Set<String> entries = new HashSet<String>();
            File file = new File(System.getenv("DISCOVERY_CONFIG_FILE"));
            if(file.exists()) {
                BufferedReader reader = new BufferedReader(new FileReader(file));
                while ((line = reader.readLine()) != null) {
                    entries.add(line.trim());
                }    
            }
            return entries;
        }    
        
        public static void start() throws  java.io.IOException, java.lang.InterruptedException {
            synchronized(Client.lock) {
                // get file system in use
                FileSystem fs = FileSystems.getDefault();
                // get config path
                Path configPath =fs.getPath(System.getenv("DISCOVERY_CONFIG_FILE")); 
                // get path name
                Client.configName = configPath.getName(configPath.getNameCount() - 1).toString();
                // get path to our config file directory
                Path path = configPath.getParent();
                // create watcher and configurator thread class
                WatchService watcher = fs.newWatchService();
                // create config watcher
                Client.configWatcher = new ConfigWatcher(watcher, Client.configName);
                // create thread with config watcher logic
                Client.thread = new Thread(Client.configWatcher, "ConfigWatcher");
                // start the thread
                Client.thread.start();
                // register watcher
                path.register(watcher, 
                    StandardWatchEventKinds.ENTRY_CREATE, 
                    StandardWatchEventKinds.ENTRY_DELETE, 
                    StandardWatchEventKinds.ENTRY_MODIFY);
                // all done
                Client.refresh();
            }
        }

        public static void stop() throws java.io.IOException, java.lang.InterruptedException  {
            synchronized(Client.lock) {
                // wait until thread finishes
                if(Client.thread != null) {
                    // mark done
                    Client.configWatcher.setSignal();
                    // wait till completion
                    Client.thread.join();
                    // all done
                    Client.thread = null;
                    Client.configWatcher = null;
                }
                // clean up
                if(Client.client != null) {
                    Client.client.shutdown();
                    Client.client = null;
                }
            }
        }

        public static void refresh() throws java.io.IOException {
            synchronized(Client.lock) {
                // assume nothing changed
                Boolean isChanged = false;
                // get entries
                Set<String> entries = Client.readEntries();
                // check if all entries in old one exist in new one
                for (String entry : Client.members) {
                    if(!entries.contains(entry))
                        isChanged = true;
                };
                // check if entries in new exist in old one
                for (String entry : entries) {
                    if(!Client.members.contains(entry))
                        isChanged = true;
                };
                // see if change has been detected
                if(isChanged) {
                    // clear
                    Client.members.clear();
                    // add new ones
                    Client.members.addAll(entries);
                    // notify
                    System.out.println("New Configuration Loaded.");
                    // see if already existing client
                    if(Client.client != null) {
                        // clean up
                        Client.client.shutdown();
                        Client.client = null;
                    }
                    // see if any members found
                    if(Client.members.size() > 0) {
                        // create new config
                        ClientConfig clientConfig = new ClientConfig();
                        ClientNetworkConfig networkConfig = clientConfig.getNetworkConfig();
                        networkConfig.setSmartRouting(true);
                        networkConfig.setRedoOperation(true);
                        GroupConfig group = clientConfig.getGroupConfig();
                        group.setName("dev");
                        group.setPassword("dev-pass");        
                        // add members
                        for (String member : Client.members) {
                            System.out.println("Adding member: " + member);
                            clientConfig.addAddress(member);
                        }
                        // create new client using config
                        Client.client = HazelcastClient.newHazelcastClient(clientConfig);                           
                    }
                }
        }
        }

        public static <K,V> V mapGet(String group, K key) {
            synchronized(Client.lock) {
                IMap<K, V> map = Client.client.getMap(group); 
                return map.get("last");
            }
        }

        public static <K,V> void mapPut(String group, K key, V value) {
            synchronized(Client.lock) {
                IMap<K, V> map = Client.client.getMap(group); 
                map.put(key, value);
            }
        }
    }