/**
 * Module to start a Websocket Server, which will serve as an endpoint for front-end services
 */
var UUID = require("uuid");
var WebSocketServer = require('websocket').server;
var http = require('http');
var CONNCONFIG = require('../egsm-common/config/connectionconfig')
var LOG = require('../egsm-common/auxiliary/logManager');
const { MonitoringManager } = require("../monitoring/monitoringmanager");

module.id = 'SOCKET'

const MIN_PORT = 8000
const MAX_PORT = 60000
CONNCONFIG.setSocketaddress('localhost', Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1) + MIN_PORT))

var sessions = new Map() //session_id -> session related data

var server = http.createServer(function (request, response) {
    LOG.logSystem('DEBUG', 'Received request', module.id)
    response.writeHead(404);
    response.end();
});
server.listen(CONNCONFIG.getConfig().socket_port, function () {
    LOG.logSystem('DEBUG', `Socket Server is listening on port ${CONNCONFIG.getConfig().socket_port}`, module.id)
});

wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    return true;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        request.reject();
        LOG.logSystem('DEBUG', `Connection from origin ${request.origin} rejected`, module.id)
        return;
    }

    var connection = request.accept('data-connection', request.origin);
    LOG.logSystem('DEBUG', `Connection from origin ${request.origin} accepted`, module.id)
    //Object to store session data
    var sessionId = UUID.v4()
    sessions.set(sessionId, {
        connection: connection,
        subscriptions: new Set()
    })

    connection.on('message', function (message) {
        LOG.logSystem('DEBUG', `Message received`, module.id)
        messageHandler(message.utf8Data, sessionId).then((data) => {
            connection.sendUTF(JSON.stringify(data))
        })

    });

    connection.on('close', function (reasonCode, description) {
        
        sessions.delete(sessionId)
        LOG.logSystem('DEBUG', `Peer ${connection.remoteAddress} disconnected`, module.id)
    });
});

async function messageHandler(message, sessionid) {
    var msgObj = JSON.parse(JSON.parse(message))

    if (msgObj['type'] == 'job_update') {
        return subscribeJobEvents(sessionid, msgObj['payload']['job_id'])

    }
    else if (msgObj['type'] == 'command') {
        switch (msgObj['type']) {

        }
    }
}

/**
 * Subscribes the specified session to the events of the specified job
 * If both the 'jobid' and 'sessionid' were valid, the system will forward event from the specified job to the Websocket Session
 * Please note that these events are not the same as the Notifications sent to Stakeholders and so may not all Job types using it, 
 * these events are more specific than Notifications and intended to be used for job observation (e.g.: Sending BPMN diagram updates to the
 * front-end)
 *  
 * @param {String} session ID of the specified Websocket Session
 * @param {String} jobid ID of the specified job
 * @returns And Object containing the result of the operation
 */
function subscribeJobEvents(session, jobid) {
    var job = MonitoringManager.getInstance().getJob(jobid)
    if (job) {
        if (job.eventEmitter.listeners('job-update').length == 0) {
            job.eventEmitter.on('job-update', onJobEvent)
        }
        sessions.get(session).subscriptions.add(jobid)
        job.triggerCompleteUpdateEvent()
        return { result: "subscribed" }
    }
    else {
        console.warn(`Job with ID [${jobid}] not found`)
        return {result: "error"}
    }
}

/**
 * Function to be called by Jobs in case of a new Event
 * @param {Object} data Object to be forwarded through the Websocket 
 */
function onJobEvent(data) {
    var message = {
        type: 'job_update',
        payload: {
            update: data
        }
    }
    for (let [session, sessionData] of sessions) {
        if (sessionData.subscriptions.has(data['job_id'])) {
            LOG.logSystem('DEBUG', `Sending Job Update message to [${session}]`, module.id)
            sessionData.connection.sendUTF(JSON.stringify(message))
        }
    }
}