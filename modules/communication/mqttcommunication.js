/**
 * Responsible to handle software-level MQTT communication
 */

var UUID = require("uuid");

var MQTT = require("../egsm-common/communication/mqttconnector")
var LOG = require('../egsm-common/auxiliary/logManager')
var AUX = require('../egsm-common/auxiliary/auxiliary')
var CONNCONFIG = require('../egsm-common/config/connectionconfig');
const { Broker } = require("../egsm-common/auxiliary/primitives");

module.id = "MQTTCOMM"

const ID_VERIFICATION_PERIOD = 1500 //Time the other Aggregators has to reply if their ID is identical with the one the local worker wants to use

const PROCESS_DISCOVERY_PERIOD = 1500 //Waiting period used in the Process Discovery feature

//Topic definitions
const AGGREGATORS_TO_SUPERVISORS = 'aggregators_to_supervisor'
const SUPERVISOR_TO_AGGREGATORS = 'supervisor_to_aggregators'
const WORKERS_TO_AGGREGATORS = 'workers_to_aggregators'
const AGGREGATORS_TO_WORKERS = 'aggregators_to_workers'
const AGGREGATORS_TO_AGGREGATORS = 'aggregators_to_aggregators'

var MQTT_HOST = undefined
var MQTT_PORT = undefined;
var MQTT_USER = undefined;
var MQTT_USER_PW = undefined

var REQUEST_PROMISES = new Map() // Request id -> Responsible Promise Object
var REQUEST_BUFFERS = new Map() // Request id -> Usage specific storage place (used only for specific type of requests)

var MONITORING_MANAGER = undefined // Reference to the used Monitoring Manager instance

function onMessageReceived(hostname, port, topic, message) {
    LOG.logSystem('DEBUG', `New message received from topic: ${topic}`, module.id)
    if ((hostname != MQTT_HOST || port != MQTT_PORT) || (topic != SUPERVISOR_TO_AGGREGATORS && topic != CONNCONFIG.getConfig().self_id && topic != WORKERS_TO_AGGREGATORS && topic != AGGREGATORS_TO_AGGREGATORS)) {
        LOG.logSystem('DEBUG', `Reveived message is not intended to handle here`, module.id)
        return
    }
    try {
        var msgJson = JSON.parse(message.toString())
    } catch (e) {
        LOG.logSystem('ERROR', `Error while parsing mqtt message: ${message}`, module.id)
        return
    }
    if (!MONITORING_MANAGER) {
        LOG.logSystem('WARNING', `Monitoring Manager has not been added to MQTT Communication module. Some features may no work as intended!`, module.id)
    }
    //The message has been published by the supervisor to the shared SUPERVISOR_TO_AGGREGATORS
    //These messages have been delived to all other Aggregators too
    if (topic == SUPERVISOR_TO_AGGREGATORS) {
        switch (msgJson['message_type']) {
            case 'PING': {
                LOG.logSystem('DEBUG', `PING requested`, module.id)
                var response = {
                    request_id: msgJson['request_id'],
                    message_type: 'PONG',
                    sender_id: CONNCONFIG.getConfig().self_id,
                    payload: {
                        hostname: CONNCONFIG.getConfig().socket_host,
                        port: CONNCONFIG.getConfig().socket_port,
                        uptime: process.uptime(),
                        activity_mumber: MONITORING_MANAGER.getNumberOfJobs(),
                        capacity: MONITORING_MANAGER.getCapacity()
                    }
                }
                MQTT.publishTopic(MQTT_HOST, MQTT_PORT, AGGREGATORS_TO_SUPERVISORS, JSON.stringify(response))
                break;
            }
            case 'NEW_JOB_SLOT': {
                LOG.logSystem('DEBUG', `NEW_JOB_SLOT requested`, module.id)
                if (MONITORING_MANAGER.hasFreeSlot()) {
                    var response = {
                        request_id: msgJson['request_id'],
                        free_slots: MONITORING_MANAGER.getCapacity() - MONITORING_MANAGER.getNumberOfJobs(),
                        message_type: 'NEW_JOB_SLOT_RESP',
                        sender_id: CONNCONFIG.getConfig().self_id
                    }
                    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, AGGREGATORS_TO_SUPERVISORS, JSON.stringify(response))
                }
                break
            }
            case 'SEARCH': {
                LOG.logWorker('DEBUG', `SEARCH requested for ${msgJson['payload']['job_id']}`, module.id)
                if (MONITORING_MANAGER.getJobInfo(msgJson['payload']['job_id'])) {
                    var response = {
                        request_id: msgJson['request_id'],
                        message_type: 'SEARCH',
                        sender_id: CONNCONFIG.getConfig().self_id,
                        payload: { job: MONITORING_MANAGER.getJobInfo(msgJson['payload']['job_id']) },
                    }
                    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, AGGREGATORS_TO_SUPERVISORS, JSON.stringify(response))
                }
                break
            }
        }
    } else if (topic == WORKERS_TO_AGGREGATORS) {
        switch (msgJson['message_type']) {
            case 'PROCESS_GROUP_MEMBER_DISCOVERY_RESP': {
                LOG.logSystem('DEBUG', `PROCESS_GROUP_MEMBER_DISCOVERY_RESP message received, request_id: [${msgJson['request_id']}]`, module.id)
                if (REQUEST_PROMISES.has(msgJson['request_id'])) {
                    REQUEST_BUFFERS.get(msgJson['request_id']).push(...msgJson['payload']['engines'])
                }
                break;
            }
        }
    } else if (topic == AGGREGATORS_TO_AGGREGATORS) {
        switch (msgJson.message_type) {
            case 'PROCESS_DEVIATIONS': {
                LOG.logSystem('DEBUG', `PROCESS_DEVIATIONS message received`, module.id)
                if (MONITORING_MANAGER) {
                    const processType = msgJson['payload']['process_type'];
                    const perspective = msgJson['payload']['process_perspective'];
                    for (const [jobId, job] of MONITORING_MANAGER.jobs) {
                        if (job.job_type === 'process-deviation-aggregation' &&
                            job.processType === processType &&
                            job.perspectives.has(perspective)) {
                            job.handleDeviations(msgJson['payload']);
                            LOG.logSystem('DEBUG', `PROCESS_DEVIATIONS routed to job ${jobId}`, module.id);
                        }
                    }
                }
                break;
            }
        }
    } else if (topic == CONNCONFIG.getConfig().self_id) {
        LOG.logSystem('DEBUG', `Dedicated message received`, module.id)
        switch (msgJson['message_type']) {
            case 'NEW_JOB': {
                LOG.logSystem('DEBUG', `NEW_JOB requested`, module.id)
                var result = MONITORING_MANAGER.startJob(msgJson['payload']['job_config'])//createNewEngine(msgJson['payload'])
                var response = {
                    request_id: msgJson['request_id'],
                    payload: { result: result },
                    message_type: 'NEW_JOB_RESP'
                }
                MQTT.publishTopic(MQTT_HOST, MQTT_PORT, AGGREGATORS_TO_SUPERVISORS, JSON.stringify(response))
                break;
            }
            //case 'GET_JOB_LIST': {
            //    LOG.logSystem('DEBUG', `GET_JOB_LIST requested`, module.id)
            //    var resPayload = MONITORING_MANAGER.getAllJobs()
            //    var response = {
            //        request_id: msgJson['request_id'],
            //        payload: resPayload,
            //        message_type: 'GET_JOB_LIST_RESP'
            //    }
            //    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, AGGREGATORS_TO_SUPERVISORS, JSON.stringify(response))
            //    break;
            //}
        }
    }
}

/**
 * Wrapper function to execute delay
 * @param {int} delay Required dely in millis
 */
async function wait(delay) {
    await AUX.sleep(delay)
}

/**
 * Executes an ID uniqueness verification through cooperating with other Aggregators 
 * @param {string} candidate ID candidate to verify uniqueness
 * @returns A Promise, which becomes 'ok' if the ID was unique 'not_ok' otherwise
 */
async function checkIdCandidate(candidate) {
    var request_id = UUID.v4();
    var message = JSON.stringify(
        request_id = request_id,
        message_type = 'PING'
    )
    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, candidate, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)

        wait(ID_VERIFICATION_PERIOD).then(() => {
            resolve('ok')
        })
    });
    return promise
}

/**
 * Init Broker connection the module will use. It will also find a unique ID for the Aggregator itself
 * @param {Broker} broker Broker credentials
 * @returns Returns the own ID of the Aggregator
 */
async function initPrimaryBrokerConnection(broker) {
    MQTT_HOST = broker.host
    MQTT_PORT = broker.port
    MQTT_USER = broker.username
    MQTT_USER_PW = broker.password

    MQTT.init(onMessageReceived)
    MQTT.createConnection(MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_USER_PW)

    //Find an unused, unique ID for the Engine
    while (true) {
        var topicSelf = UUID.v4();
        MQTT.subscribeTopic(MQTT_HOST, MQTT_PORT, topicSelf)
        var result = await checkIdCandidate(topicSelf)
        if (result == 'ok') {
            break;
        }
        else {
            MQTT.unsubscribeTopic(MQTT_HOST, MQTT_PORT, topicSelf)
        }
    }
    MQTT.subscribeTopic(MQTT_HOST, MQTT_PORT, WORKERS_TO_AGGREGATORS)
    MQTT.subscribeTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TO_AGGREGATORS)
    MQTT.subscribeTopic(MQTT_HOST, MQTT_PORT, AGGREGATORS_TO_AGGREGATORS, false)
    return topicSelf
}

/**
 * Setting the Monitoring Manager instance used by this module
 * This is similar to Observer design pattern and necessary to avoid circular dependency of MQTT module 
 * @param {Object} manager Reference to the new MonitoringManager object 
 */
function setMonitoringManager(manager) {
    MONITORING_MANAGER = manager
}

/**
 * Discovers the online Processes satisfying a set of rules
 * @param {Object} rules Rules the Engines should satisfy. 
 * The function broadcasts a message which is received by each Workers. If any of them has at least one engine satisfying the rules it will reply
 * Finally the function receives the reply, and builds a set containing all Process Instances which has at least one engine among the received replies 
 * @returns Promise will contain a set of Engine Id-s (<Process Type>/<Instance ID>)
 */
async function discoverProcessGroupMembers(rules) {
    var request_id = UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'PROCESS_GROUP_MEMBER_DISCOVERY',
        "payload": { "rules": rules }
    }
    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, AGGREGATORS_TO_WORKERS, JSON.stringify(message))
    var promise = new Promise(async function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        REQUEST_BUFFERS.set(request_id, [])
        await wait(PROCESS_DISCOVERY_PERIOD)
        LOG.logSystem('DEBUG', `discoverProcessGroupMembers waiting period elapsed`, module.id)
        var result = REQUEST_BUFFERS.get(request_id)
        REQUEST_PROMISES.delete(request_id)
        REQUEST_BUFFERS.delete(request_id)
        if (result.length == 0) {
            resolve(new Set([]))
        }
        else {
            var final = new Set()
            //Result contains an Array of {process_type, process_instance, process_perspective...} created by getEngineDetails function 
            //In case of multiple perspectives one process instance can be represented multiple times,
            //so we need to handle it, since we want only process_type + process_instance 
            result.forEach(engine => {
                final.add(engine.name)
            });
            resolve(final)
        }
    });
    return promise
}

module.exports = {
    checkIdCandidate: checkIdCandidate,
    initPrimaryBrokerConnection: initPrimaryBrokerConnection,
    discoverProcessGroupMembers: discoverProcessGroupMembers,
    setMonitoringManager: setMonitoringManager
}