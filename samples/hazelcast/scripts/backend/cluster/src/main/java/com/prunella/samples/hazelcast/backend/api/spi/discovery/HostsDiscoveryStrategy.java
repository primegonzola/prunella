/*
 * Copyright (c) 2008-2018, Hazelcast, Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.prunella.samples.hazelcast.backend.api.spi.discovery;
import com.hazelcast.config.NetworkConfig;
import com.hazelcast.logging.ILogger;
import com.hazelcast.nio.Address;
import com.hazelcast.spi.discovery.AbstractDiscoveryStrategy;
import com.hazelcast.spi.discovery.DiscoveryNode;
import com.hazelcast.spi.discovery.SimpleDiscoveryNode;

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

/**
 * THIS CODE IS NOT PRODUCTION READY!
 */
public class HostsDiscoveryStrategy extends AbstractDiscoveryStrategy {

    private final String discoveryConfigFile;

    HostsDiscoveryStrategy(ILogger logger, Map<String, Comparable> properties) {
        super(logger, properties);
        //
        // make it possible to override the value from the configuration on
        // the system's environment or JVM properties -Ddiscovery.hosts.configuration-uri=some.uri
        //
        this.discoveryConfigFile = getOrNull("discovery.hosts", HostsDiscoveryConfiguration.DISCOVERY_CONFIG_FILE);
    }

    @Override
    public Iterable<DiscoveryNode> discoverNodes() {
        Collection<DiscoveryNode> nodes = new ArrayList<DiscoveryNode>();
        try {
            List<String> lines = readLines(new File(this.discoveryConfigFile));
            for (String line : lines) {
                Address address = new Address(line, NetworkConfig.DEFAULT_PORT);           
                nodes.add(new SimpleDiscoveryNode(address));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return nodes;
    }

    private List<String> readLines(File file) throws java.io.IOException {
        String line;
        List<String> lines = new ArrayList<String>();
        if(file.exists()) {
            BufferedReader reader = new BufferedReader(new FileReader(file));
            while ((line = reader.readLine()) != null) {
                lines.add(line.trim());
            }   
        }
        return lines;
    }

    private InetAddress mapToInetAddress(String address) {
        try {
            return InetAddress.getByName(address);
        } catch (UnknownHostException e) {
            throw new RuntimeException("Could not resolve ip address", e);
        }
    }
}