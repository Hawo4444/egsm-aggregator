var fs = require('fs');

var LOG = require('./modules/egsm-common/auxiliary/logManager')
var MQTTCOMM = require('./modules/communication/mqttcommunication')
var DBCONFIG = require('./modules/egsm-common/database/databaseconfig');
var CONNCONFIG = require('./modules/egsm-common/config/connectionconfig');
var SOCKETSERVER = require('./modules/communication/socketserver')
var AUX = require('./modules/egsm-common/auxiliary/auxiliary')
const { MonitoringManager } = require('./modules/monitoring/monitoringmanager');
const { NotificationManager } = require('./modules/communication/notificationmanager');
const { ProcessNotification } = require('./modules/egsm-common/auxiliary/primitives');

const CONFIG_FILE = './config.xml'
module.id = "MAIN"

LOG.logSystem('DEBUG', 'Aggregator started...', module.id)

var filecontent = fs.readFileSync(CONFIG_FILE, 'utf8')

CONNCONFIG.applyConfig(filecontent)
MonitoringManager.getInstance()

DBCONFIG.initDatabaseConnection(CONNCONFIG.getConfig().database_host, CONNCONFIG.getConfig().database_port, CONNCONFIG.getConfig().database_region,
    CONNCONFIG.getConfig().database_access_key_id, CONNCONFIG.getConfig().database_secret_access_key)

LOG.logSystem('DEBUG', 'Finding a unique ID by active cooperation with peers...', module.id)

MQTTCOMM.initPrimaryBrokerConnection(CONNCONFIG.getConfig().primary_broker).then((result) => {
    CONNCONFIG.setSelfId(result)
    LOG.logSystem('DEBUG', `Unique ID found: [${result}]`, module.id)
    LOG.logSystem('DEBUG', 'Aggregator initialization ready!', module.id)
})
