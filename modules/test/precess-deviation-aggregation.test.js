const AUX = require('../egsm-common/auxiliary/auxiliary')
const LOG = require('../egsm-common/auxiliary/logManager')
var UUID = require('uuid');
var MQTTCOMM = require('../communication/mqttcommunication')
var DBCONFIG = require('../egsm-common/database/databaseconfig')
var PRIM = require('../egsm-common/auxiliary/primitives');
var DYNAMO = require('../egsm-common/database/dynamoconnector')
const fs = require('fs');
const path = require('path');

jest.mock('../egsm-common/database/databaseconnector', () => ({
    readAllProcessTypeDeviations: jest.fn(),
    readAllProcessInstances: jest.fn(),
    storeProcessDeviations: jest.fn(),
    writeNewProcessType: jest.fn(),
    writeNewProcessInstance: jest.fn()
}));

var DB = require('../egsm-common/database/databaseconnector');
const { ProcessDeviationAggregation } = require('../monitoring/monitoringtypes/process-deviation-aggregation');

async function initTables() {
    var promises = []
    promises.push(DYNAMO.initTable('PROCESS_TYPE', 'PROCESS_TYPE_NAME', undefined))
    promises.push(DYNAMO.initTable('PROCESS_INSTANCE', 'PROCESS_TYPE_NAME', 'INSTANCE_ID'))
    promises.push(DYNAMO.initTable('PROCESS_GROUP_DEFINITION', 'NAME', undefined))
    promises.push(DYNAMO.initTable('STAKEHOLDERS', 'STAKEHOLDER_ID', undefined))
    promises.push(DYNAMO.initTable('PROCESS_DEVIATIONS', 'PROCESS_TYPE', 'INSTANCE_ID'))
    promises.push(DYNAMO.initTable('ARTIFACT_DEFINITION', 'ARTIFACT_TYPE', 'ARTIFACT_ID'))
    promises.push(DYNAMO.initTable('ARTIFACT_USAGE', 'ARTIFACT_NAME', 'CASE_ID'))
    promises.push(DYNAMO.initTable('ARTIFACT_EVENT', 'ARTIFACT_NAME', 'EVENT_ID', { indexname: 'PROCESSED_INDEX', pk: { name: 'ENTRY_PROCESSED', type: 'N' } }))
    promises.push(DYNAMO.initTable('STAGE_EVENT', 'PROCESS_NAME', 'EVENT_ID'))
    await Promise.all(promises)
}

async function deleteTables() {
    var TABLES = [
        'PROCESS_TYPE', 'PROCESS_INSTANCE', 'PROCESS_GROUP_DEFINITION', 'STAKEHOLDERS',
        'PROCESS_DEVIATIONS', 'ARTIFACT_EVENT', 'ARTIFACT_USAGE', 'ARTIFACT_DEFINITION', 'STAGE_EVENT'
    ]
    var promises = []
    TABLES.forEach(element => {
        promises.push(DYNAMO.deleteTable(element))
    });
    await Promise.all(promises)
}

beforeAll(() => {
    DYNAMO.initDynamo('fakeMyKeyId', 'fakeSecretAccessKey', 'local', 'http://localhost:8000')
});

beforeEach(async () => {
    LOG.setLogLevel(5)
    await initTables()
});

afterEach(async () => {
    await deleteTables()
})

var broker = new PRIM.Broker('localhost', 1883, '', '')

LOG.setLogLevel(5)
beforeAll(() => {
    LOG.setLogLevel(5)
});

beforeEach(async () => {
    DBCONFIG.initDatabaseConnection('localhost', '8000', 'local', 'fakeMyKeyId', 'fakeSecretAccessKey')
    MQTTCOMM.initPrimaryBrokerConnection(broker)
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

function loadBpmnFile(filename) {
    const bpmnPath = path.join(__dirname, 'fixtures', filename);
    return fs.readFileSync(bpmnPath, 'utf8');
}

function createMockPerspectiveData(perspectiveName, stages) {
    return new Map([
        [perspectiveName, {
            name: perspectiveName,
            egsm_stages: stages,
            bpmn_diagram: loadBpmnFile('bpmn_truck.bpmn')
        }]
    ]);
}

async function createMockProcessInstances(processType, perspective, instanceIds) {
    const promises = instanceIds.map(id =>
        DB.writeNewProcessInstance(processType, `${id}__${perspective}`, ['stakeholder-1'], '10', 'localhost', 1883)
    );
    await Promise.all(promises);
}

function createMockDeviations(type, stageA, stageB = null, details = {}) {
    return [{
        type: type,
        block_a: stageA,
        block_b: stageB,
        details: details,
        timestamp: Math.floor(Date.now() / 1000)
    }];
}

//TEST CASES BEGIN

test('ProcessDeviationAggregation - initialize with empty process type', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C'])
    
    DB.readAllProcessTypeDeviations.mockResolvedValue({});
    DB.readAllProcessInstances.mockResolvedValue([]);
    DB.writeNewProcessType.mockResolvedValue(true);
    
    const processTypeDefinition = {
        name: 'Process-type-1',
        owner: 'owner',
        description: 'description',
        perspectives: [
            {
                name: 'truck',
                egsm_stages: ['Stage_A', 'Stage_B', 'Stage_C']
            }
        ]
    }
    await DB.writeNewProcessType(processTypeDefinition)
    
    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)

    const result = await instance.initialize()

    expect(result).toBe(true)
    expect(instance.processType).toBe('Process-type-1')
    expect(instance.deviationData).toBeDefined()
    expect(instance.stageAggregatedData).toBeDefined()
    expect(instance.perspectiveSummary).toBeDefined()
    
    expect(DB.readAllProcessTypeDeviations).toHaveBeenCalledWith('Process-type-1', 'truck')
    expect(DB.readAllProcessInstances).toHaveBeenCalledWith('Process-type-1')
})

test('ProcessDeviationAggregation - initialize with existing instances but no deviations', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C'])

    const mockInstances = [
        { instance_id: 'p1__truck', process_type: 'Process-type-1' },
        { instance_id: 'p2__truck', process_type: 'Process-type-1' },
        { instance_id: 'p3__truck', process_type: 'Process-type-1' }
    ];
    
    DB.readAllProcessTypeDeviations.mockResolvedValue({});
    DB.readAllProcessInstances.mockResolvedValue(mockInstances);
    DB.writeNewProcessType.mockResolvedValue(true);

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)

    const result = await instance.initialize()

    expect(result).toBe(true)

    const summary = instance.perspectiveSummary.get('truck')
    expect(summary.totalInstances).toBe(3)
    expect(summary.instancesWithDeviations).toBe(0)
    expect(summary.instancesWithoutDeviations).toBe(3)
    expect(summary.totalDeviations).toBe(0)
    expect(summary.overallDeviationRate).toBe(0)
})

test('ProcessDeviationAggregation - initialize with instances and deviations', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C'])

    const mockInstances = [
        { instance_id: 'p1__truck', process_type: 'Process-type-1' },
        { instance_id: 'p2__truck', process_type: 'Process-type-1' },
        { instance_id: 'p3__truck', process_type: 'Process-type-1' }
    ];

    const deviations1 = createMockDeviations('SKIPPED', 'Stage_A')
    const deviations2 = createMockDeviations('OVERLAP', 'Stage_B', 'Stage_C')

    const mockDeviationData = {
        'p1': { deviations: deviations1 },
        'p2': { deviations: deviations2 }
    };

    DB.readAllProcessTypeDeviations.mockResolvedValue(mockDeviationData);
    DB.readAllProcessInstances.mockResolvedValue(mockInstances);
    DB.writeNewProcessType.mockResolvedValue(true);
    DB.storeProcessDeviations.mockResolvedValue(true);

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)

    const result = await instance.initialize()

    expect(result).toBe(true)

    const summary = instance.perspectiveSummary.get('truck')
    expect(summary.totalInstances).toBe(3)
    expect(summary.instancesWithDeviations).toBe(2)
    expect(summary.instancesWithoutDeviations).toBe(1)
    expect(summary.totalDeviations).toBe(2)
    expect(summary.overallDeviationRate).toBeCloseTo(66.67, 2)
})

test('ProcessDeviationAggregation - handle new deviations', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C'])

    const mockInstances = [
        { instance_id: 'p1__truck', process_type: 'Process-type-1' },
        { instance_id: 'p2__truck', process_type: 'Process-type-1' }
    ];

    DB.readAllProcessTypeDeviations.mockResolvedValue({});
    DB.readAllProcessInstances.mockResolvedValue(mockInstances);
    DB.writeNewProcessType.mockResolvedValue(true);
    DB.storeProcessDeviations.mockResolvedValue(true);

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const messageObj = {
        process_id: 'p1__truck',
        process_perspective: 'truck',
        deviations: createMockDeviations('SKIPPED', 'Stage_A')
    }

    await instance.handleDeviations(messageObj)

    const summary = instance.perspectiveSummary.get('truck')
    expect(summary.instancesWithDeviations).toBe(1)
    expect(summary.totalDeviations).toBe(1)
})

test('ProcessDeviationAggregation - handle new instance', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C'])

    await createMockProcessInstances('Process-type-1', 'truck', ['p1', 'p2'])

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    await instance.handleNewInstance('p3')

    const summary = instance.perspectiveSummary.get('truck')
    expect(summary.totalInstances).toBe(3)

    const deviationData = instance.deviationData.get('truck')
    expect(deviationData['p3']).toBeDefined()
    expect(deviationData['p3'].deviations).toEqual([])
})

test('ProcessDeviationAggregation - get complete aggregation data', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B'])

    await createMockProcessInstances('Process-type-1', 'truck', ['p1', 'p2'])

    const deviations1 = createMockDeviations('SKIPPED', 'Stage_A')
    await DB.storeProcessDeviations('Process-type-1', 'p1__truck', 'truck', deviations1)

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const data = instance.getCompleteAggregationData()

    expect(data.job_id).toBe('agg-1')
    expect(data.job_type).toBe('process-deviation-aggregation')
    expect(data.process_type).toBe('Process-type-1')
    expect(data.perspectives).toHaveLength(1)
    expect(data.perspectives[0].name).toBe('truck')
    expect(data.summary).toBeDefined()
    expect(data.summary.perspectives).toHaveLength(1)
    expect(data.summary.overall).toBeDefined()
})

test('ProcessDeviationAggregation - get aggregated summary', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B'])

    const mockInstances = [
        { instance_id: 'p1__truck', process_type: 'Process-type-1' },
        { instance_id: 'p2__truck', process_type: 'Process-type-1' },
        { instance_id: 'p3__truck', process_type: 'Process-type-1' }
    ];

    const deviations1 = createMockDeviations('SKIPPED', 'Stage_A')
    const deviations2 = createMockDeviations('SKIPPED', 'Stage_B')
    const deviations3 = createMockDeviations('OVERLAP', 'Stage_A', 'Stage_B')

    const mockDeviationData = {
        'p1': { deviations: deviations1 },
        'p2': { deviations: deviations2 },
        'p3': { deviations: deviations3 }
    };

    DB.readAllProcessTypeDeviations.mockResolvedValue(mockDeviationData);
    DB.readAllProcessInstances.mockResolvedValue(mockInstances);
    DB.writeNewProcessType.mockResolvedValue(true);
    DB.storeProcessDeviations.mockResolvedValue(true);

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const summary = instance.getAggregatedSummary()

    expect(summary.perspectives).toHaveLength(1)
    expect(summary.perspectives[0].perspective).toBe('truck')
    expect(summary.perspectives[0].totalStages).toBe(2)
    expect(summary.perspectives[0].stagesWithDeviations).toBe(2)
    expect(summary.perspectives[0].stageDetails).toBeDefined()
    expect(summary.overall).toBeDefined()
    expect(summary.overall.totalInstances).toBe(3)
})

test('ProcessDeviationAggregation - get stage details', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B'])

    const mockInstances = [
        { instance_id: 'p1__truck', process_type: 'Process-type-1' },
        { instance_id: 'p2__truck', process_type: 'Process-type-1' }
    ];

    const deviations1 = createMockDeviations('SKIPPED', 'Stage_A')
    const mockDeviationData = {
        'p1': { deviations: deviations1 }
    };

    DB.readAllProcessTypeDeviations.mockResolvedValue(mockDeviationData);
    DB.readAllProcessInstances.mockResolvedValue(mockInstances);
    DB.writeNewProcessType.mockResolvedValue(true);
    DB.storeProcessDeviations.mockResolvedValue(true);

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const summary = instance.getAggregatedSummary()
    const stageDetails = summary.perspectives[0].stageDetails['Stage_A']

    expect(stageDetails).not.toBeNull()
    expect(stageDetails.totalInstances).toBe(2)
    expect(stageDetails.instancesWithDeviations).toBe(1)
    expect(stageDetails.deviationRate).toBe(50)
    expect(stageDetails.deviationCounts).toEqual({ 'SKIPPED': 1 })
})

test('ProcessDeviationAggregation - handle external request for complete data', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A'])

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const response = instance.getCompleteAggregationData()

    expect(response.job_id).toBe('agg-1')
    expect(response.job_type).toBe('process-deviation-aggregation')
    expect(response.process_type).toBe('Process-type-1')
})

test('ProcessDeviationAggregation - handle external request for summary', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A'])

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const response = instance.getAggregatedSummary()

    expect(response.perspectives).toBeDefined()
    expect(response.overall).toBeDefined()
})

test('ProcessDeviationAggregation - handle external request for stage details', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A'])

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const summary = instance.getAggregatedSummary()
    const response = summary.perspectives[0].stageDetails['Stage_A']

    expect(response.totalInstances).toBeDefined()
    expect(response.deviationRate).toBeDefined()
})

test('ProcessDeviationAggregation - normalize stage IDs with iteration suffix', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_A_iteration'])

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)

    const normalized1 = instance._normalizeStageId('Stage_A_iteration')
    const normalized2 = instance._normalizeStageId('Stage_A')

    expect(normalized1).toBe('Stage_A')
    expect(normalized2).toBe('Stage_A')
})

test('ProcessDeviationAggregation - extract instance ID from engine ID', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A'])

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)

    const instanceId = instance._extractInstanceId('p3__truck', 'truck')
    expect(instanceId).toBe('p3')

    const instanceId2 = instance._extractInstanceId('instance-123__carrier', 'carrier')
    expect(instanceId2).toBe('instance-123')
})

test('ProcessDeviationAggregation - multiple perspectives with different deviations', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = new Map([
        ['truck', {
            name: 'truck',
            egsm_stages: ['Stage_A', 'Stage_B'],
            bpmn_diagram: loadBpmnFile('bpmn_truck.bpmn')
        }],
        ['carrier', {
            name: 'carrier',
            egsm_stages: ['Stage_X', 'Stage_Y'],
            bpmn_diagram: loadBpmnFile('bpmn_truck.bpmn')
        }]
    ])

    const mockInstances = [
        { instance_id: 'p1__truck', process_type: 'Process-type-1' },
        { instance_id: 'p2__truck', process_type: 'Process-type-1' },
        { instance_id: 'p1__carrier', process_type: 'Process-type-1' },
        { instance_id: 'p2__carrier', process_type: 'Process-type-1' }
    ];

    const truckDeviations = createMockDeviations('SKIPPED', 'Stage_A')
    const carrierDeviations = createMockDeviations('OVERLAP', 'Stage_X', 'Stage_Y')

    DB.readAllProcessTypeDeviations
        .mockResolvedValueOnce({ 'p1': { deviations: truckDeviations } })
        .mockResolvedValueOnce({ 'p1': { deviations: carrierDeviations } });
    
    DB.readAllProcessInstances.mockResolvedValue(mockInstances);
    DB.writeNewProcessType.mockResolvedValue(true);
    DB.storeProcessDeviations.mockResolvedValue(true);

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const summary = instance.getAggregatedSummary()

    expect(summary.perspectives).toHaveLength(2)
    expect(summary.perspectives.find(p => p.perspective === 'truck')).toBeDefined()
    expect(summary.perspectives.find(p => p.perspective === 'carrier')).toBeDefined()

    const truckSummary = summary.perspectives.find(p => p.perspective === 'truck')
    const carrierSummary = summary.perspectives.find(p => p.perspective === 'carrier')

    expect(truckSummary.totalInstances).toBe(2)
    expect(carrierSummary.totalInstances).toBe(2)
    expect(truckSummary.instancesWithDeviations).toBe(1)
    expect(carrierSummary.instancesWithDeviations).toBe(1)
})

test('ProcessDeviationAggregation - complex stage calculations', async () => {
    var notifman = new MockNotificationManager()
    var perspectives = createMockPerspectiveData('truck', ['Stage_A', 'Stage_B', 'Stage_C'])

    const mockInstances = [
        { instance_id: 'p1__truck', process_type: 'Process-type-1' },
        { instance_id: 'p2__truck', process_type: 'Process-type-1' },
        { instance_id: 'p3__truck', process_type: 'Process-type-1' },
        { instance_id: 'p4__truck', process_type: 'Process-type-1' }
    ];

    const mockDeviationData = {
        'p1': { 
            deviations: [
                { type: 'SKIPPED', block_a: 'Stage_A', timestamp: Date.now() },
                { type: 'SKIPPED', block_a: 'Stage_A', timestamp: Date.now() + 1000 }
            ]
        },
        'p2': { 
            deviations: [
                { type: 'SKIPPED', block_a: 'Stage_A', timestamp: Date.now() },
                { type: 'SKIPPED', block_a: 'Stage_B', timestamp: Date.now() + 2000 }
            ]
        },
        'p3': { 
            deviations: [
                { type: 'OVERLAP', block_a: 'Stage_A', block_b: 'Stage_B', timestamp: Date.now() + 3000 }
            ]
        }
    };

    DB.readAllProcessTypeDeviations.mockResolvedValue(mockDeviationData);
    DB.readAllProcessInstances.mockResolvedValue(mockInstances);
    DB.writeNewProcessType.mockResolvedValue(true);

    var instance = new ProcessDeviationAggregation('agg-1', [broker], 'owner', 'Process-type-1', perspectives, [], notifman)
    await instance.initialize()

    const perspectiveSummary = instance.perspectiveSummary.get('truck')
    expect(perspectiveSummary.totalInstances).toBe(4)
    expect(perspectiveSummary.instancesWithDeviations).toBe(3)
    expect(perspectiveSummary.instancesWithoutDeviations).toBe(1)
    expect(perspectiveSummary.totalDeviations).toBe(5)
    expect(perspectiveSummary.overallDeviationRate).toBe(75)

    const stageAggregatedData = instance.stageAggregatedData.get('truck')
    
    const stageA = stageAggregatedData.get('Stage_A')
    expect(stageA.totalInstances).toBe(4)
    expect(stageA.instancesWithDeviations.size).toBe(2)
    expect(stageA.deviationRate).toBe(50)
    expect(stageA.deviations).toHaveLength(3)
    expect(stageA.counts.get('SKIPPED')).toBe(3)

    const stageB = stageAggregatedData.get('Stage_B')
    expect(stageB.totalInstances).toBe(4)
    expect(stageB.instancesWithDeviations.size).toBe(2)
    expect(stageB.deviationRate).toBe(50)
    expect(stageB.deviations).toHaveLength(2)
    expect(stageB.counts.get('SKIPPED')).toBe(1)
    expect(stageB.counts.get('OVERLAP')).toBe(1)

    const stageC = stageAggregatedData.get('Stage_C')
    expect(stageC.totalInstances).toBe(4)
    expect(stageC.instancesWithDeviations.size).toBe(0)
    expect(stageC.deviationRate).toBe(0)
    expect(stageC.deviations).toHaveLength(0)

    const summary = instance.getAggregatedSummary()
    const perspectiveData = summary.perspectives[0]
    
    expect(perspectiveData.totalStages).toBe(3)
    expect(perspectiveData.stagesWithDeviations).toBe(2)
    expect(perspectiveData.stagesWithoutDeviations).toBe(1)
    expect(perspectiveData.averageDeviationRate).toBe(50)

    const stageADetails = summary.perspectives[0].stageDetails['Stage_A']
    expect(stageADetails.instancesWithDeviations).toBe(2)
    expect(stageADetails.deviationCounts).toEqual({ 'SKIPPED': 3 })

    const stageBDetails = summary.perspectives[0].stageDetails['Stage_B']
    expect(stageBDetails.instancesWithDeviations).toBe(2)
    expect(stageBDetails.deviationCounts).toEqual({ 'SKIPPED': 1, 'OVERLAP': 1 })
})