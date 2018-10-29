package com.prunella.samples.hazelcast.frontend.api;

import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.Date;

@RestController
public class ApiController {
    @RequestMapping("/")
    public String index() {
        return "Greetings from Spring Boot!";
    }

    @RequestMapping("/read")
    public String read() {
        try {
            return "RESULT: " + Client.mapGet("test", "last");
        }
        catch(Exception e) {
            e.printStackTrace();
            return e.getMessage();
        }
    }

    @RequestMapping("/write")
    public void write() {
        try {
            Client.mapPut("test", "last", new Date().toString());
        }
        catch(Exception e) {
            e.printStackTrace();
        }
    }

    @RequestMapping("/health")
    public String health() {
        return "Health Probe Response";
    }
}