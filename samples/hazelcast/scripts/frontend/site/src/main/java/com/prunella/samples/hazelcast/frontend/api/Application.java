package com.prunella.samples.hazelcast.frontend.api;

import java.util.Arrays;

import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.ApplicationContext;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.web.servlet.ServletListenerRegistrationBean;

@SpringBootApplication
public class Application {
    public class ShutdownServletContextListener implements ServletContextListener {
        @Override
        public void contextInitialized(ServletContextEvent sce) {
            try {
                // start our client
                Client.start();
            }
            catch(Exception e) {
                System.out.println(e.getMessage());
                e.printStackTrace();
            }
        }
         
        @Override
        public void contextDestroyed(ServletContextEvent sce) {
            try {
                // stop our client
                Client.stop();
            }
            catch(Exception e) {
                System.out.println(e.getMessage());
                e.printStackTrace();
            }
        }
    }

    public static void main(String[] args) {
        // run main spring boot class 
        SpringApplication.run(Application.class, args);
    }

    @Bean
    public CommandLineRunner commandLineRunner(ApplicationContext ctx) {
        return args -> {
            String[] beanNames = ctx.getBeanDefinitionNames();
            Arrays.sort(beanNames);
            for (String beanName : beanNames) {
                System.out.println(beanName);
            }
        };
    }

    @Bean
    ServletListenerRegistrationBean<ServletContextListener> ShutdownServletListener() {
        ServletListenerRegistrationBean<ServletContextListener> srb = new ServletListenerRegistrationBean<>();
        srb.setListener(new ShutdownServletContextListener());
        return srb;
    }    
}