var UUID = require("uuid");
var WebSocketServer = require('websocket').server;
var http = require('http');
var CONNCONFIG = require('../egsm-common/config/connectionconfig')
var LOG = require('../egsm-common/auxiliary/logManager');
const { MonitoringManager } = require("../monitoring/monitoringmanager");

module.id = 'SOCKET'

min = Math.ceil(8000);
max = Math.floor(60000);
CONNCONFIG.setSocketaddress('localhost', Math.floor(Math.random() * (max - min + 1) + min))

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

function subscribeJobEvents(session, jobid) {
    var job = MonitoringManager.getInstance().getJob(jobid)
    if (job) {
        //console.log(job.eventEmitter.listeners('job-update').length)
        if (job.eventEmitter.listeners('job-update').length == 0) {
            job.eventEmitter.on('job-update', onJobEvent)
        }
        sessions.get(session).subscriptions.add(jobid)
        job.triggerCompleteUpdateEvent()
        return { result: "subscribed" }
    }
    else {
        console.warn(`Job with ID [${jobid}] does not found`)
        return
    }
}

function onJobEvent(data) {
    var message = {
        type: 'job_update',
        payload: {
            update: data
        }
    }
    for (let [session, sessionData] of sessions) {
        console.log(session)
        console.log(sessionData)
        console.log(data['job_id'])
        if (sessionData.subscriptions.has(data['job_id'])) {
            sessionData.connection.sendUTF(JSON.stringify(message))
        }
    }
}