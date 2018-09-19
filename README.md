# Prunella: Auto healing for Azure Virtual Machine Scale Sets 

## Introduction
Prunella is a sample solution demonstrating auto healing of Virtual Machines contained within a Virtual Machine Scale Set (VMSS) on Azure. 

An Azure VMMS is a quite powerful service and provides an additional abstraction layer in dealing with large auto-scalable compute scenarios based on identical VM's. A critical part of that is dealing with failed VM's assuring that capacity stays as requested and needed by the business consuming the services. 

Failure and subsequent remediating actions are required not only on the network, compute and storage level, but ideally also on the application level. 

## Conceptual
Talking about health state indicates the need for a source of truth or controller i.e. what controls the decision to decide a VM is at failure. Conceptually there are several ways to go around this:

* __Health Probing:__ An external party such as a load balancer monitors the solution and decides the actions to execute. In many cases it makes sense when the application goes down that no traffic should be routed as well. Standard and Basic Load Balancers are level 4 load balancers and provide the insights to the platform on that level. They do not provide anything on layer 7 or application level. Application Gateway does provide that functionality and allows probing and traffic routing depending on the health state provided by the application. Webhooks can be triggered using the health state provided by the gateway and actions executed. Another alternative is using an HAProxy or similar technology to handle the front load balancing while health probing the backend on the application level. 

* __Health Publishing:__ In this case the VM itself is publishing its health state along with other meta data. Listeners can register themselves on it and process the data as desired including cleaning up failed instances or other actions. This approach works for any environment as there is no dependency on any load balancer. This approach lends itself very well to single VM's and even functions or other components. The flexibility of sending additional application meta data is also positive. Downside is that unhealthy applications can still receive traffic from the load balancer until being deleted by the runtime.

This sample solution is an example of implementing both scenarios. A first sample is shozing hoz to have a scale set being auto healed by using health publishing. A second sample includes HAProxy and is using health probing for the back end nodes and health publishing for the HAProxy nodes itself. All health info is routed through the eventgrid independent of the role.  

## Architecture
### Components
Following Azure core components are at play:

* __Event Grid:__ Act as the intermediate allowing VM's or other components to publish their state or topic, ready to be consumed by one or more listeners.

* __Azure Functions:__ Act as listener in handling health state events amongst overall state management of the targeted VMSS or another component. Several techniques are also housed allowing high capacity-based workloads.

* __Publishing Health Service:__ Depending on the environment used, different means can be applied by the application to publish its health to the event grid topic. The sample provided shows how to do it with a VM within a VMSS by using a Linux SystemD service that sends out a heartbeat every 60 seconds using bash, jq, curl minimizing the overall footprint. Windows based machines could use a background service or timer executing a PowerShell script, collecting the necessary information and publish it.  

### Application Flow 
1. Each VM in the referenced VMSS published its health state to the event grid topic. The sample is merely using a DONN or UP to indicate the right status and can be easily extended. However, before being able to send the data it requires a local access token assuring proper access to the event grid topic is granted. This process repeats itself every 60 seconds.
2. Upon arrival of the state on the event grid, it will be dispatched to the proper event listener implemented by monitor-events function. This function will validate a few things along with some housekeeping and if everything is ok, it will store its state in the status storage table. 
3. Next to the events published by each individual event, the functions are also listening for VMSS specific events like scale in and out allowing finetuning of required actions in those situations. 
3. An additional Azure function called monitor status will check every minute the entries in the status table and if the status is either marked as down or has not been updated for a configurable time, the related machine will be deleted.
4. Upon deletion of the machine, the VMSS auto-scale rules will kick in and will provision a new machine.
5. One more Azure function called monitor state and is a mirror of the targeted VMSS. Querying VM specific info for a whole VMSS is considered a high quota request and is sensitive to throttling. As such this function is querying the state every minute and stores it separately in a state storage table. The monitor status and monitor events function are never calling the scale-sets directly but instead uses the information provided in the separate state table. 

### Additional Technologies
The sample also uses additional technologies:
* __Managed Security Identity:__ Used throughout the solution allowing resource bound tokens to be issued and used in subsequently access calls, providing a cleaner and more secure way in accessing resources. Both the VM and Azure Functions are configured using MSI, finetuned through RBAC.
* __KeyVault:__ All relevant secrets are being stored in a seperate key vault for maximum security. Secrets stored are Storage Account Key, Web Hook Uri.
* __Application Insights:__ Optionally Application Insights can be used to log all message at various levels, it also provides detailed method tracing where needed.  
* __ARM Templates:__ ARM templates are the preferred way to deploy solutions into Azure. This examples uses ARM templates as much as possible. Any exceptions are mitigated by using azure-cli.
* __Typescript:__ Azure functions are running on NodeJS and the application code is written in Typescript followed by a web pack and deployed as Azure Function.
  
## Getting Started
### Requirements
* Deployment is executed using an Azure principal based on name and password. Mor info about how to create one can be found <a href="https://docs.microsoft.com/en-us/cli/azure/create-an-azure-service-principal-azure-cli?view=azure-cli-latest"> here</a>. 
* Current deployment requires bash to function properly and Ubuntu 18.04 but also WSL have been used and tested a deployment environment. 
* azure-cli, jq, curl and nodejs. Latest versions of all have been used without any issues encountered. 

The solution consists out of following parts
* Core engine handling all logic in detecting and deleting VM's within the specified VMSS. This is basically the Event Grid and the Azure Functions
* Samples demonstrating its usage, currently demonstrating how to auto heal a VMSS containing Ubuntu based VM's.

### Deploy Core
1. Clone the repo.
2. Navigate to src/deploy
3. Execute deploy.sh to see more help 
4. A typical command during development looks like this
> \# call login at least once or use -t to define tenant  
> az login  
> \# start deployment in dev environment  
> ./deploy.sh -l westeurope -g myresouregroup -u \<your principal id\> -p \<your principal password\> -dev  

### Deploy Sample
1. Clone the repo.
2. Navigate to deploy directory under samples/vmss
3. Execute deploy.sh to see more help 
4. Alternatively execute full.sh to deploy core and sample in one motion
5. A typical command during development looks like this
> \# call login at least once or use -t to define tenant  
> az login  
> \# start deployment in dev environment  
> ./full.sh -l westeurope -g myresouregroup -u \<your principal id\> -p \<your principal password\> -dev  

### Deployment Flow:
Following flow is followed when deploy.sh is being executed. (Similar actions are being taken in both cases i.e. core and sample)
1. A bootstrap account is created in the specified region along with a SAS token providing correct access to the resources contained.
2. All required ARM templates and related scripts are uploaded in the right container
3. Main deployment template is executed through azure-cli pointing at the one in the bootstrap container.
4. Depending on core or sample solution, several templates will be executed deploying the needed resources
5. In case of core solution, the azure functions will be locally initialized, transforming the typescript into JavaScript, followed by a webpack and uploaded through git into the deployed Azure Function Web App.
6. In case of the sample, the scale-set deployment will execute a custom scrip extension, initializing the SystemD service to call the publishing health script every 60 seconds. 
7. Once all completed, the core will delete its bootstrap account. The sample does not as it requires access to the bootstrap account in case of scale out events and a new machine needs provisioning.  

### Testing:
The sample deploys a jumpbox along with the sample allowing you connect to a machine a put it in an unhealthy state. Execute following steps to do so:
1. Obtain the public IP of the jumpbox
2. Connect via ssh to the jumpbox
3. Connect via ssh to one of the instances, the ip will be in the 10.0.1.x range 
4. Stop the health service by executing systemctl stop vmss-host-status.service or alternatively, modify the annoucer.sh file to return a DOWN status which will delete the machine during next scan.
5. After the specified timeout in the app settings of the functions, the machine will be deleted
6. Auto-scaling will kick in and provision a new machine

## Important Notes 
* The solution is highly depending on auto-scale rules as the platform knows best. The action being triggered is simply deleting the machine and the platform is doing the rest.
* Reboots are considered being a failure. During reboots no health info is published and subsequently the machine will be deleted and a new one will be provisioned in a clean state. Overall this is the preferred way in dealing with scaling scenarios.
* All access from and to event grid and storage account hosting the storage tables are handled through MSI allowing you to safely remove the principal used during deployment.
* Different deployment configurations are possible. One could deploy an instance of this solution for each VMSS or alternatively one could deploy the core solution once and register multiple VMSS instance to be monitored by a single core. Of course, a mix of both is equally possible. There is currently hard limitation due to lack of proper paging in dealing with querying the table storage and as such no more than 1000 machines can be currently handled by a single core deployment across different VMSS's.
* Configuration settings are all managed through Application Settings belonging to the Azure Function App. By default, the LOG LEVEL is set to All (15) and DEBUG to true providing a very verbose information through Application Insights. Adjust accordingly depending on your needs.
* The VMSS Samples VM's can be accessed using the password and user name provided in the deployment script allowing you to connect to the individual VM's using ssh. Ideally this should be changed to accepting a ssh key instead.
* Experimental support is in there for grace period i.e. ignore any health state for time specified time in seconds, allowing machines to warm up. 

## Possible Improvements 
* Proper paging of table storage being used allowing higher capacity per VMSS, currently limited to 1000 VM's.
* Support for single instance VM healing. As deletion is not possible, one could opt for reimaging the VM in case of failure.
* Windows based example publishing health info through PowerShell and/or azure-cli  
* Turn the core into a service catalog item allowing easy distribution through private marketplace within organizations
* Extending the framework with some additional hooks allowing customization of incoming events, making headway for an additional sample based on HAProxy.
* Currently nothing is being done with the VMSS related events being listened to. The azure function is always copying the complete state of the scale-set at a fixed interval. An optimization could be to avoid this by only updating the state when the scale-set scales triggers a scale in or out event. 
* Notification support through Web Hooks in case machines are being deleted
* Adding back offlogic in case throttling (429 errors) occur
* Improve documentation and more samples.
* End to end automated testing for the basic scenario.