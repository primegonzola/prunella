package com.prunella.samples.hazelcast.frontend.api;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;
import com.hazelcast.client.HazelcastClient;
import com.hazelcast.client.config.ClientConfig;
import com.hazelcast.core.HazelcastInstance;
import com.hazelcast.core.IMap;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Date;

@RestController
public class ApiController {
    private List<String> readLines(File path) {
        try {
            String line;
            List<String> lines = new ArrayList<String>();
            BufferedReader reader = new BufferedReader(new FileReader(path));
            while ((line = reader.readLine()) != null) {
                lines.add(line.trim());
            }
            return lines;
        } catch (IOException e) {
            throw new RuntimeException("Could not read hosts file", e);
        }
    }    

    private HazelcastInstance createHazelcastClient() {
        ClientConfig clientConfig = new ClientConfig();
        clientConfig.getNetworkConfig().addAddress("127.0.0.1");
        List<String> lines = readLines(new File(System.getenv("DISCOVERY_CONFIG_FILE")));
        for (String line : lines) {
            clientConfig.getNetworkConfig().addAddress(line);
        }
        return HazelcastClient.newHazelcastClient(clientConfig);        
    }


    @RequestMapping("/")
    public String index() {
        return "Greetings from Spring Boot!";
    }

    @RequestMapping("/read")
    public String read() {
        HazelcastInstance client = this.createHazelcastClient();
        IMap<String, String> map = client.getMap("test"); 
        String last = map.get("last");
        client.shutdown();
        return "RESULT: " + last;
    }

    @RequestMapping("/write")
    public void write() {
        HazelcastInstance client = this.createHazelcastClient();
        IMap<String, String> map = client.getMap("test"); 
        Date last = new Date();
        map.put("last", last.toString());
        client.shutdown();
    }

    @RequestMapping("/health")
    public String health() {
        return "Health Probe Response";
    }
}