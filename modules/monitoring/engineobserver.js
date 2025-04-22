/**
 * Module responsible for receive Events from Processes and forward these events to other interested modules
 * The communication is happening through MQTT, the module performs the necessary subscriptions
 */
var UUID = require('uuid');

var LOG = require('../egsm-common/auxiliary/logManager')
var MQTT = require('../egsm-common/communication/mqttconnector')
var DB = require('../egsm-common/database/databaseconnector')
var GROUPMAN = require('../monitoring/groupmanager');
const { Broker } = require('../egsm-common/auxiliary/primitives');

const TOPIC_PROCESS_LIFECYCLE = 'process_lifecycle'

module.id = "OBSV"

/**
 * Map to store default MQTT broker of each engine instances, 
 * furthermore a counter indicates how many monitoring activity is using the engine
 * This value is used to avoid unnecessary MQTT subscription function calls and to 
 * remove the engine from this map only when no activity left subscribed to its topics
 */
var ENGINES = new Map()
var PROCESS_TYPES = new Map()

var MONITORED_BROKERS = new Set() //HOST:PORT

/**
 * Adding a new Broker to the set of observed Brokers
 * @param {Broker} broker New Broker object to include in the observation 
 */
function addMonitoredBroker(broker) {
    LOG.logSystem('DEBUG', `Adding monitored broker: ${broker.host}:${broker.port}`, module.id)
    MQTT.createConnection(broker.host, broker.port, broker.username, broker.password, 'aggregator-agent-' + UUID.v4())
    MQTT.subscribeTopic(broker.host, broker.port, TOPIC_PROCESS_LIFECYCLE)
    MONITORED_BROKERS.add(broker.host + ':' + broker.port)
}

/**
 * Remove a Broker among observed Brokers
 * @param {Broker} broker Broker Object
 */
function removeMonitoredBroker(broker) {
    LOG.logSystem('DEBUG', `Removing monitored broker: ${broker.host}:${broker.port}`, module.id)
    if (MONITORED_BROKERS.has(broker.host + ':' + broker.port)) {
        MQTT.unsubscribeTopic(broker.host, broker.port, TOPIC_PROCESS_LIFECYCLE)
        MONITORED_BROKERS.delete(broker.host + ':' + broker.port)
    }
}

/**
 * Called when a new MQTT message received
 * @param {String} hostname 
 * @param {Number} port 
 * @param {String} topic Topic the message received from 
 * @param {String} message The message itself
 * @returns 
 */
function onMessageReceived(hostname, port, topic, message) {
    /*if(topic != TOPIC_PROCESS_LIFECYCLE){
        return
    }*/
    LOG.logWorker('DEBUG', `onMessageReceived called`, module.id)
    try {
        var msgJson = JSON.parse(message.toString())
    } catch (error) {
        LOG.logWorker('ERROR', `Error while parsing JSON message (${error})`, module.id)
        return
    }
    //Process lifecycle message arrived to the global process lifecycle topic
    if (topic == TOPIC_PROCESS_LIFECYCLE) {
        GROUPMAN.onProcessLifecycleEvent(msgJson)
        return
    }
    //The message is from an engine-specific topic
    var processid = msgJson['process_type'] + '/' + msgJson['process_id'] + '__' + msgJson['process_perspective']
    if (ENGINES.has(processid)) {
        //Notify Jobs
        ENGINES.get(processid).onchange.forEach(jobnotify => {
            jobnotify(msgJson)
        });
    }
}

/**
 * Subscribing to the event of a specified process
 * @param {String} instance_id Instance ID of the process
 * @param {Object} onchange Function to call in case of a new Event received
 */
async function addProcess(instance_id, onchange) {
    LOG.logWorker('DEBUG', `addProcess called: ${instance_id} -> ${hostname}:${port}`, module.id)
    //Add engine to the module collections
    if (!ENGINES.has(instance_id)) {
        //Retrieving engine details from Database
        //var elements = instance_id.split('/')
        //var type = elements[0]
        //var instanceid = elements[1]
        //var retrieved = await DB.readProcessInstance(type, instanceid)
        //if (retrieved == undefined) {
        //    LOG.logWorker('ERROR', `Process [${instance_id}] is not registered in the database, it cannot be monitored`, module.id)
        //    return
        //}
        //TODO: Read broker from database instead
        //var hostname = retrieved.host
        //var port = retrieved.port
        var broker = new Broker('localhost', 1883, '', '')
        var hostname = broker.host
        var port = broker.port

        ENGINES.set(instance_id, { hostname: hostname, port: port, onchange: new Set([onchange]) })
        if (!MONITORED_BROKERS.has(hostname + ':' + port.toString())) {
            addMonitoredBroker(broker)
        }
        MQTT.subscribeTopic(hostname, port, instance_id + '/stage_log')
        MQTT.subscribeTopic(hostname, port, instance_id + '/artifact_log')
        MQTT.subscribeTopic(hostname, port, instance_id + '/adhoc')
    }
    else {
        LOG.logWorker('DEBUG', `Process [${instance_id}] is already registered`, module.id)
        ENGINES.get(instance_id).onchange.add(onchange)
    }
}

/**
 * Unsubscribe from the events of a Process Instance
 * @param {String} instance_id Instance ID of the Process Instance
 * @param {Object} onchange Function to call in case of an event
 */
function removeProcess(instance_id, onchange) {
    LOG.logWorker('DEBUG', `removeProcess called: ${instance_id}`, module.id)
    if (ENGINES.has(instance_id) && ENGINES.get(instance_id).onchange.size == 1) {
        MQTT.unsubscribeTopic(ENGINES.get(instance_id).hostname, ENGINES.get(instance_id).port, instance_id + '/stage_log')
        MQTT.unsubscribeTopic(ENGINES.get(instance_id).hostname, ENGINES.get(instance_id).port, instance_id + '/artifact_log')
        MQTT.unsubscribeTopic(ENGINES.get(instance_id).hostname, ENGINES.get(instance_id).port, instance_id + '/adhoc')
        ENGINES.delete(instance_id)
    }
    else if (ENGINES.has(instance_id) && ENGINES.get(instance_id).onchange.size > 1) {
        ENGINES.get(instance_id).onchange.delete(onchange)
    }
    else {
        LOG.logWorker('WARNING', `Process [${instance_id}] cannot be removed, it is not registered`, module.id)
    }
}

//Setting up MQTT environment
MQTT.init(onMessageReceived)

module.exports = {
    addMonitoredBroker: addMonitoredBroker,
    removeMonitoredBroker: removeMonitoredBroker,
    addProcess: addProcess,
    removeProcess: removeProcess
}