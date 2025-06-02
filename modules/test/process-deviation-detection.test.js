const { ProcessDeviationDetection } = require('../monitoring/monitoringtypes/process-deviation-detection');
const AUX = require('../egsm-common/auxiliary/auxiliary')
const LOG = require('../egsm-common/auxiliary/logManager')
var UUID = require('uuid');
var MQTTCOMM = require('../communication/mqttcommunication')
var DBCONFIG = require('../egsm-common/database/databaseconfig')
var PRIM = require('../egsm-common/auxiliary/primitives');
const { ProcessNotification } = require('../egsm-common/auxiliary/primitives');

var broker = new PRIM.Broker('localhost', 1883, '', '')

LOG.setLogLevel(5)
beforeAll(() => {
    LOG.setLogLevel(5)
});

beforeEach(async () => {
    DBCONFIG.initDatabaseConnection('localhost','8000','local','fakeMyKeyId','fakeSecretAccessKey')
    MQTTCOMM.initPrimaryBrokerConnection(broker)
    //OBS.addMonitoredBroker(broker)
});

afterEach(async () => {

})

async function wait(delay) {
    await AUX.sleep(delay)
}

class MockNotificationManager {
    constructor() {
        this.notification = undefined
        this.notification_rules = undefined
    }
    notifyEntities(notification, notificationrules) {
        this.notification = notification
        this.notification_rules = notificationrules
    }
    reset() {
        this.notification = undefined
        this.notification_rules = undefined
    }
    getLastNotification() {
        return this.notification
    }
    getLastNotificationRules() {
        return this.notification_rules
    }
}

//TEST CASES BEGIN

test('onProcessEvent() - detect process deviation', async () => {
    var notifman = new MockNotificationManager()
    var instance = new ProcessDeviationDetection('obs-1', [broker], 'owner', ['Process-type-1/instance-1'], [], ['NOTIFY_ALL'], notifman)
    var messageObj = {
        processtype: 'Process-type-1',
        instanceid: 'instance-1',
        perspective: 'truck',
        stage: {
            name: 'Stage_A',
            status: 'ok',
            state: 'Opened',
            compliance: 'OutOfOrder',
        }
    }
    instance.onProcessEvent(messageObj)
    data = notifman.getLastNotification()
    data.id = ''
    data.timestamp = 0

    var errorsExpected = [{
        type: 'compliance',
        stage: 'Stage_A',
        value: 'OutOfOrder',

    }]
    var message = `Process deviation detected at [Process-type-1/instance-1]__truck]!`
    var expected = new ProcessNotification('obs-1', undefined, 'process-deviation-detection', message, 'Process-type-1', 'instance-1', 'truck', ['Process-type-1/instance-1'], errorsExpected)
    expected.id = ''
    expected.timestamp = 0
    expect(data).toEqual(expected)
    expect(notifman.getLastNotificationRules()).toEqual(['NOTIFY_ALL'])
})

//STATUS:WORKER LOG SENDING 
//FORMAT may not be correct 
//also check databae dbase writeStageEvent and read