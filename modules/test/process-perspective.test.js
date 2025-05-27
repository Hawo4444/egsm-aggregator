const fs = require('fs');

const { ProcessPerspective, SkipDeviation, OverlapDeviation, IncorrectExecutionSequenceDeviation, IncompleteDeviation, MultiExecutionDeviation,
  IncorrectBranchDeviation } = require('../monitoring/monitoringtypes/bpmn/process-perspective');
const AUX = require('../egsm-common/auxiliary/auxiliary')
const LOG = require('../egsm-common/auxiliary/logManager');
const { EgsmModel } = require('../monitoring/monitoringtypes/bpmn/egsm-model');
const { EgsmStage } = require('../monitoring/monitoringtypes/bpmn/egsm-stage');
const { BpmnModel } = require('../monitoring/monitoringtypes/bpmn/bpmn-model');

//var EGSM , BPMN
/*beforeAll(() => {
    try {
        EGSM = fs.readFileSync('./process-perspective-test/egsm.xml', 'utf8');
        BPMN = fs.readFileSync('./process-perspective-test/model.bpmn', 'utf8');
      } catch (err) {
        console.error(err);
      }
});*/
//Test cases
//SEQUENCE block tests
test('SEQUENCE - No deviation', async () => {
  //e, A, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = []
  var data = pers1.analyze()
  expect(data).toEqual(expected)
})

test('SEQUENCE - One stage skipped', async () => {
  //e, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, undefined, 'SKIPPED')
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', 'OUTOFORDER')
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [new SkipDeviation(['ch2'], 'ch3', 0, -1)]
  var data = pers1.analyze()
  expect(data).toEqual(expected)
})

test('SEQUENCE - Multiple stages skipped', async () => {
  //e, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, undefined, 'SKIPPED')
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [new SkipDeviation(['ch2', 'ch3'], 'ch4', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Start event skipped', async () => {
  //A, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, undefined, 'SKIPPED')
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [new SkipDeviation(['ch1'], 'ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Last event not executed and parent should be closed', async () => {
  //e, A, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [new SkipDeviation(['ch4'], null, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Only first event executed and parent should be closed', async () => {
  //e, A, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [new SkipDeviation(['ch4', 'ch3', 'ch2'], null, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Multiple stages including start event skipped', async () => {
  //f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, undefined, 'SKIPPED')
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [new SkipDeviation(['ch1', 'ch2', 'ch3'], 'ch4', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Multi-execution of a stage', async () => {
  //e, A, A, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [
    new MultiExecutionDeviation('ch2', 2, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Multi-execution of a stage more than twice', async () => {
  //e, A, A, B, A, A, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [
    new MultiExecutionDeviation('ch2', 4, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Multi-execution of an event more than twice', async () => {
  //e, e, A, e, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [
    new MultiExecutionDeviation('ch1', 3, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Incorrect execution sequence including 2 stages', async () => {
  //e, B, A, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, undefined, 'SKIPPED')
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [new IncorrectExecutionSequenceDeviation('ch2', 'ch3', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Stage opened but not finished - parent should be closed', async () => {
  //e, A_s, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new OverlapDeviation(['ch3', 'ch4'], 'ch2', 0, -1),
    new IncompleteDeviation('ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Stage opened but not finished - parent should not be closed', async () => {
  //e, A_s, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch3', 'ch4'], 'ch2', 0, -1),
    new IncompleteDeviation('ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Overlapped activities', async () => {
  //e, B_s, A_s, B_e, A_e, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, undefined, 'SKIPPED')
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch2'], 'ch3', 0, -1),
    new IncorrectExecutionSequenceDeviation('ch2', 'ch3', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE - Overlapped activities, multiple skips', async () => {
  //e_s, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NONE'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'ch1'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'ch3'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3', 'ch4']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, undefined, 'SKIPPED')
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch4'], 'ch1', 0, -1),
    new IncompleteDeviation('ch1', 0, -1),
    new SkipDeviation(['ch2', 'ch3'], 'ch4', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//PARALLEL block tests
test('PARALLEL - One stage not executed at all - parent should be closed', async () => {
  //B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new SkipDeviation(['ch1'], 'NONE', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - One stage not executed at all - parent should not be closed yet', async () => {
  //B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)

  var expected = []
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - One stage opened but not closed - parent should be closed', async () => {
  //A_s, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new IncompleteDeviation('ch1', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - One stage opened but not closed - parent should not be closed yet', async () => {
  //A_s, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)

  var expected = []
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - Multiple stages not executed - parent should be closed', async () => {
  //C
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new SkipDeviation(['ch1'], 'NONE', 0, -1),
    new SkipDeviation(['ch2'], 'NONE', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - Multiple stages not executed - parent should not be closed yet', async () => {
  //C
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.status = 'REGULAR'
  stage1.state = 'OPEN'
  stage1.compliance = 'ONTIME'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)

  var expected = []
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - Multi-executing a stage - parent should be closed', async () => {
  //A, B, A, C
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [new MultiExecutionDeviation('ch1', 2, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - Multi-executing a stage - parent should not be closed yet', async () => {
  //A, B, A, C
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [new MultiExecutionDeviation('ch1', 2, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - Multi-executing more than one stages - parent should be closed', async () => {
  //A, B, A, B, C
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new MultiExecutionDeviation('ch1', 2, 0, -1),
    new MultiExecutionDeviation('ch2', 2, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('PARALLEL - Multi-executing more than one stages - parent should not be closed yet', async () => {
  //A, B, A, B, C
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'PARALLEL'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [
    new MultiExecutionDeviation('ch1', 2, 0, -1),
    new MultiExecutionDeviation('ch2', 2, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//EXCLUSIVE block tests - A(ch1) is the correct branch
test('EXCLUSIVE - Executing and incorrect branch', async () => {
  //B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)

  var expected = [new IncorrectBranchDeviation('ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE - Partially executing the correct branch - parent should be closed', async () => {
  //A_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch1.update(undefined, 'OPEN', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [new IncompleteDeviation('ch1', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE - Partially executing the correct branch - parent should not be closed', async () => {
  //A_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch1.update(undefined, 'OPEN', undefined)

  var expected = []
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//Check skip here
test('EXCLUSIVE - Partially executing an incorrect branch - parent should be closed', async () => {
  //B_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  stage1.propagateCondition('SHOULD_BE_CLOSED')
  ch1.update(undefined, undefined, 'SKIPPED')

  var expected = [
    new IncompleteDeviation('ch2', 0, -1),
    new IncorrectBranchDeviation('ch2', 0, -1),
    new SkipDeviation(['ch1'], 'NONE', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE - Partially executing an incorrect branch - parent should not be closed', async () => {
  //B_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')

  var expected = [new IncorrectBranchDeviation('ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE - Partially executing a correct branch and executing an incorrect one - parent should not be closed', async () => {
  //A_s, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)

  var expected = [new IncorrectBranchDeviation('ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//Check skip here
test('EXCLUSIVE - Partially executing a correct branch and executing an incorrect one - parent should be closed', async () => {
  //A_s, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new IncompleteDeviation('ch1', 0, -1),
    new IncorrectBranchDeviation('ch2', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE - Partially executing an incorrect branch and executing the correct one - parent should be closed', async () => {
  //B_s, A
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new IncompleteDeviation('ch2', 0, -1),
    new IncorrectBranchDeviation('ch2', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE - Partially executing an incorrect branch and executing the correct one - parent should not be closed', async () => {
  //B_s, A
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)

  var expected = [new IncorrectBranchDeviation('ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE - Overlapped executions', async () => {
  //A_s, B_s, A_e
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)

  var expected = [new IncorrectBranchDeviation('ch2', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//INCLUSIVE block tests
//A(ch1) and B(ch2) are the correct branches
test('INCLUSIVE - Executing one of the correct branches twice', async () => {
  //A, A, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'INCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [new MultiExecutionDeviation('ch1', 2, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('INCLUSIVE - Executing an incorrect branch three times', async () => {
  //C, C, C
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'INCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)

  var expected = [
    new MultiExecutionDeviation('ch3', 3, 0, -1),
    new IncorrectBranchDeviation('ch3', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('INCLUSIVE - Executing one of the correct branches partially only - parent should be closed', async () => {
  //B, A_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'INCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [new IncompleteDeviation('ch1', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('INCLUSIVE - Executing one of the correct branches partially only - parent should not be closed yet', async () => {
  //B, A_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'INCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', undefined)

  var expected = []
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('INCLUSIVE - Executing unintended branch beside the correct ones', async () => {
  //C, A, B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'INCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [new IncorrectBranchDeviation('ch3', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//A(ch1) is the correct branch
test('INCLUSIVE - Executing multiple unintended branches beside the correct one', async () => {
  //B, C, A
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parent', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'INCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  eGSM.recordStageCondition('ch1', true)
  eGSM.recordStageCondition('ch2', false)
  eGSM.recordStageCondition('ch3', false)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  var expected = [
    new IncorrectBranchDeviation('ch2', 0, -1),
    new IncorrectBranchDeviation('ch3', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//ITERATION block tests - A(ch1) -> B(ch2)
test('ITERATION - Incorrect execution sequence - 1 stage', async () => {
  //B, A
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'ITERATION'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, undefined, 'SKIPPED')
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch1.update(undefined, 'OPEN', 'OUTOFORDER')
  ch1.update(undefined, 'CLOSED', undefined)

  var expected = [
    new IncorrectExecutionSequenceDeviation('parent', 'NONE', 0, 0)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('ITERATION - Skipping A1', async () => {
  //B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'ITERATION'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, undefined, 'SKIPPED')
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)

  var expected = [
    new SkipDeviation(['ch1'], 'NONE', 0, -1),
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('ITERATION - 3 iterations, A1 skipped in the last', async () => {
  //B
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'ITERATION'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch1.update(undefined, undefined, 'SKIPPED')
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)

  var expected = [
    new SkipDeviation(['ch1'], 'NONE', 2, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('ITERATION - Incomplete execution of one stage - parent should not be closed yet', async () => {
  //A, B_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'ITERATION'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)

  var expected = []
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('ITERATION - Incomplete execution of 2 stages - parent should not be closed yet', async () => {
  //A_s, B_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'ITERATION'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')

  var expected = [
    new OverlapDeviation(['ch2'], 'ch1', 0, -1),
    new IncompleteDeviation('ch1', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('ITERATION - Incomplete execution of one stage - parent should be closed', async () => {
  //A, B_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'ITERATION'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new IncompleteDeviation('parent', 0, 0),
    new IncompleteDeviation('ch2', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('ITERATION - Incomplete execution of 2 stages - parent should be executed', async () => {
  //A_s, B_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parent', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'

  //Parent stage
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'ITERATION'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'ch2']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new IncompleteDeviation('parent', 0, 0),
    new OverlapDeviation(['ch2'], 'ch1', 0, -1),
    new IncompleteDeviation('ch1', 0, -1),
    new IncompleteDeviation('ch2', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//Combined blocks tests
//SEQUENCE&PARALLEL blocks tests - e(ch1) -> A(ch2)+B(ch3) -> f(ch4)
test('SEQUENCE&PARALLEL - Missing parallel stage execution', async () => {
  //e, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parallel', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parallel', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'parallel'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'parallel', 'ch4']

  var stage2 = new EgsmStage('parallel', 'parallel', 'parent', 'EXCEPTION', '')
  stage2.type = 'PARALLEL'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('parallel', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, undefined, 'SKIPPED')
  stage2.propagateCondition('SHOULD_BE_CLOSED')
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new SkipDeviation(['parallel'], 'ch4', 0, -1),
    new SkipDeviation(['ch2'], 'NONE', 0, -1),
    new SkipDeviation(['ch3'], 'NONE', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

// Check shouldbeclosed propagation to parallel - would it actually happen? - wasn't in the original code
test('SEQUENCE&PARALLEL - Incomplete parallel stage execution', async () => {
  //e, A_s, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parallel', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parallel', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'parallel'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'parallel', 'ch4']

  var stage2 = new EgsmStage('parallel', 'parallel', 'parent', 'EXCEPTION', '')
  stage2.type = 'PARALLEL'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('parallel', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  //stage2.propagateCondition('SHOULD_BE_CLOSED')
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new OverlapDeviation(['ch4'], 'parallel', 0, -1),
    new IncompleteDeviation('parallel', 0, -1),
    new IncompleteDeviation('ch3', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

//Consider adding test where both branches CLOSED and then one reopens so parent reopens
test('SEQUENCE&PARALLEL - Executing one parallel stage more than once', async () => {
  //e, A, A, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'parallel', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'parallel', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'parallel'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'parallel', 'ch4']

  var stage2 = new EgsmStage('parallel', 'parallel', 'parent', 'EXCEPTION', '')
  stage2.type = 'PARALLEL'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('parallel', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [new MultiExecutionDeviation('ch2', 2, 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&EXCLUSIVE - Executing an incorrect exclusive branch', async () => {
  //e, B, A, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'exclusive', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'exclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'exclusive'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'exclusive', 'ch4']

  var stage2 = new EgsmStage('exclusive', 'exclusive', 'parent', 'EXCEPTION', '')
  stage2.type = 'EXCLUSIVE'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('exclusive', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  stage2.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [new IncorrectBranchDeviation('ch3', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&EXCLUSIVE - Not executing the desired branch and executing a non-desired', async () => {
  //e, B, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'exclusive', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'exclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'exclusive'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'exclusive', 'ch4']

  var stage2 = new EgsmStage('exclusive', 'exclusive', 'parent', 'EXCEPTION', '')
  stage2.type = 'EXCLUSIVE'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('exclusive', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  stage2.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, undefined, 'SKIPPED')
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new OverlapDeviation(['ch4'], 'exclusive', 0, -1),
    new IncompleteDeviation('exclusive', 0, -1),
    new IncorrectBranchDeviation('ch3', 0, -1),
    new SkipDeviation(['ch2'], 'NONE', 0, -1)]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&EXCLUSIVE - Special case: incorrect branch opens, correct branch opens OoO, incorrect multi execution', async () => {
  //e, B_s, A_s, B_e, B, A_e, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'exclusive', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'exclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'exclusive'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'exclusive', 'ch4']

  var stage2 = new EgsmStage('exclusive', 'exclusive', 'parent', 'EXCEPTION', '')
  stage2.type = 'EXCLUSIVE'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('exclusive', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)

  stage2.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch2.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, 'CLOSED', undefined)

  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new MultiExecutionDeviation('ch3', 2, 0, -1),
    new IncorrectBranchDeviation('ch3', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&INCLUSIVE - Executing an incorrect branch', async () => {
  //e, B, f - A was the only correct branch
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'inclusive', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'inclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'inclusive'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'inclusive', 'ch4']

  var stage2 = new EgsmStage('inclusive', 'inclusive', 'parent', 'EXCEPTION', '')
  stage2.type = 'INCLUSIVE'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('inclusive', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', false)
  stage2.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, undefined, 'SKIPPED')
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new OverlapDeviation(['ch4'], 'inclusive', 0, -1),
    new IncompleteDeviation('inclusive', 0, -1),
    new IncorrectBranchDeviation('ch3', 0, -1),
    new SkipDeviation(['ch2'], 'NONE', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&INCLUSIVE - Incomplete branch execution', async () => {
  //e, B_s, f - both A and B were correct branches
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'inclusive', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'inclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'inclusive'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'inclusive', 'ch4']

  var stage2 = new EgsmStage('inclusive', 'inclusive', 'parent', 'EXCEPTION', '')
  stage2.type = 'INCLUSIVE'
  stage2.direct_predecessor = 'ch1'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('inclusive', stage2)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  eGSM.recordStageCondition('ch2', true)
  eGSM.recordStageCondition('ch3', true)
  stage2.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, undefined, 'SKIPPED')//not sure here
  //propagate? if so, in what order?
  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)
  stage1.propagateCondition('SHOULD_BE_CLOSED')

  var expected = [
    new OverlapDeviation(['ch4'], 'inclusive', 0, -1),
    new IncompleteDeviation('inclusive', 0, -1),
    new IncompleteDeviation('ch3', 0, -1),
    new SkipDeviation(['ch2'], 'NONE', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('EXCLUSIVE&SEQUENCE - Correct sequence branch reopens', async () => {
  //A, A, A_s
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'exclusive', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'exclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch3', 'ch3', 'exclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'NA'
  var ch5 = new EgsmStage('ch3', 'ch3', 'exclusive', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'exclusive'

  //Parent stages
  var parent = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  parent.type = 'SEQUENCE'
  parent.direct_predecessor = 'NONE'
  parent.children = ['ch1', 'exclusive', 'ch5']

  var stage1 = new EgsmStage('exclusive', 'exclusive', 'NA', 'EXCEPTION', '')
  stage1.type = 'EXCLUSIVE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['sequence', 'ch4']

  var stage2 = new EgsmStage('sequence', 'sequence', 'exclusive', 'EXCEPTION', '')
  stage2.type = 'SEQUENCE'
  stage2.direct_predecessor = 'NONE'
  stage2.children = ['ch2', 'ch3']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', parent)
  eGSM.stages.set('exclusive', stage1)
  eGSM.stages.set('sequence', stage2)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  eGSM.stages.set('ch5', ch5)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  parent.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  eGSM.recordStageCondition('sequence', true)
  eGSM.recordStageCondition('ch3', false)

  stage1.update(undefined, 'OPEN', undefined)
  stage2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  stage1.update(undefined, 'OPEN', 'OUTOFORDER')
  stage2.update(undefined, 'UNOPENED', undefined)
  stage2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch3.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  stage2.update(undefined, 'CLOSED', undefined)
  stage1.update(undefined, 'CLOSED', undefined)

  stage1.update(undefined, 'OPEN', 'OUTOFORDER')
  stage2.update(undefined, 'UNOPENED', undefined)
  stage2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch3.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)

  ch5.update(undefined, 'OPEN', 'OUTOFORDER')
  ch5.update(undefined, 'CLOSED', undefined)
  parent.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch5'], 'exclusive', 0, -1),
    new IncompleteDeviation('exclusive', 0, -1),
    new MultiExecutionDeviation('exclusive', 3, 0, -1),
    new IncompleteDeviation('sequence', 2, -1),
    new SkipDeviation(['ch3'], null, 2, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&LOOP - Loop should be closed and two iterations, first is correct, second incorrect order second incomplete', async () => {
  //e, A, B, B, A, A_s, f
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'iteration', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'iteration', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'loop'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'loop', 'ch4']

  var iteration = new EgsmStage('iteration', 'iteration', 'loop', 'EXCEPTION', '')
  iteration.type = 'ITERATION'
  iteration.direct_predecessor = 'NA'
  iteration.children = ['ch2', 'ch3']

  var loop = new EgsmStage('loop', 'loop', 'parent', 'EXCEPTION', '')
  loop.type = 'LOOP'
  loop.direct_predecessor = 'ch1'
  loop.children = ['iteration']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('loop', loop)
  eGSM.stages.set('iteration', iteration)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  loop.update(undefined, 'OPEN', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch3.update(undefined, 'OPEN', 'OUTOFORDER')
  ch3.update(undefined, 'CLOSED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'OPEN', undefined)

  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch4'], 'loop', 0, -1),
    new IncompleteDeviation('loop', 0, -1),
    new IncompleteDeviation('iteration', 2, 2),
    new IncompleteDeviation('ch2', 2, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&LOOP - Incorrect loop exit, one more iteration should have been executed', async () => {
  //e, A, B, f - both A and B were correct branches
  //Children stages
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'iteration', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'iteration', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'loop'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'loop', 'ch4']

  var iteration = new EgsmStage('iteration', 'iteration', 'loop', 'EXCEPTION', '')
  iteration.type = 'ITERATION'
  iteration.direct_predecessor = 'NA'
  iteration.children = ['ch2', 'ch3']

  var loop = new EgsmStage('loop', 'loop', 'parent', 'EXCEPTION', '')
  loop.type = 'LOOP'
  loop.direct_predecessor = 'ch1'
  loop.children = ['iteration']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('loop', loop)
  eGSM.stages.set('iteration', iteration)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  loop.update(undefined, 'OPEN', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch4'], 'loop', 0, -1),
    new IncompleteDeviation('loop', 0, -1),
    new SkipDeviation(['iteration'], 'NONE', 1, 1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&LOOP - Incorrect loop exit, last iteration not finished', async () => {
  //e, A, B, f - both A and B were correct branches
  //Children stages`
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'iteration', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'iteration', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'loop'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'loop', 'ch4']

  var iteration = new EgsmStage('iteration', 'iteration', 'loop', 'EXCEPTION', '')
  iteration.type = 'ITERATION'
  iteration.direct_predecessor = 'NA'
  iteration.children = ['ch2', 'ch3']

  var loop = new EgsmStage('loop', 'loop', 'parent', 'EXCEPTION', '')
  loop.type = 'LOOP'
  loop.direct_predecessor = 'ch1'
  loop.children = ['iteration']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('loop', loop)
  eGSM.stages.set('iteration', iteration)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  loop.update(undefined, 'OPEN', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'OPEN', undefined)

  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch4'], 'loop', 0, -1),
    new IncompleteDeviation('loop', 0, -1),
    new IncompleteDeviation('iteration', 1, 1),
    new IncompleteDeviation('ch2', 1, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&LOOP - Incorrect loop exit, last iteration not finished, iteration children unopened', async () => {
  //e, A, B, f - both A and B were correct branches
  //Children stages`
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'iteration', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'iteration', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'loop'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'loop', 'ch4']

  var iteration = new EgsmStage('iteration', 'iteration', 'loop', 'EXCEPTION', '')
  iteration.type = 'ITERATION'
  iteration.direct_predecessor = 'NA'
  iteration.children = ['ch2', 'ch3']

  var loop = new EgsmStage('loop', 'loop', 'parent', 'EXCEPTION', '')
  loop.type = 'LOOP'
  loop.direct_predecessor = 'ch1'
  loop.children = ['iteration']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('loop', loop)
  eGSM.stages.set('iteration', iteration)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'CLOSED', undefined)
  loop.update(undefined, 'OPEN', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)

  ch4.update(undefined, 'OPEN', 'OUTOFORDER')
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch4'], 'loop', 0, -1),
    new IncompleteDeviation('loop', 0, -1),
    new IncompleteDeviation('iteration', 1, 1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&LOOP - Activity overlapped with multiple openings of iteration branches', async () => {
  //e_s, A, B, A, f - both A and B were correct branches
  //Children stages`
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'iteration', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'iteration', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'loop'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'loop', 'ch4']

  var iteration = new EgsmStage('iteration', 'iteration', 'loop', 'EXCEPTION', '')
  iteration.type = 'ITERATION'
  iteration.direct_predecessor = 'NA'
  iteration.children = ['ch2', 'ch3']

  var loop = new EgsmStage('loop', 'loop', 'parent', 'EXCEPTION', '')
  loop.type = 'LOOP'
  loop.direct_predecessor = 'ch1'
  loop.children = ['iteration']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('loop', loop)
  eGSM.stages.set('iteration', iteration)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  loop.update(undefined, 'OPEN', 'OUTOFORDER')

  iteration.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  loop.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch2', 'ch3', 'ch2', 'ch4'], 'ch1', 0, -1),
    new IncompleteDeviation('ch1', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})

test('SEQUENCE&LOOP - Activity overlapped with multiple openings of iteration branches, eventually closed', async () => {
  //e_s, A, B, A, B, e_e, A, f - both A and B were correct branches
  //Children stages`
  var ch1 = new EgsmStage('ch1', 'ch1', 'parent', 'EXCEPTION', '')
  ch1.type = 'ACTIVITY'
  ch1.direct_predecessor = 'NA'
  var ch2 = new EgsmStage('ch2', 'ch2', 'iteration', 'EXCEPTION', '')
  ch2.type = 'ACTIVITY'
  ch2.direct_predecessor = 'NA'
  var ch3 = new EgsmStage('ch3', 'ch3', 'iteration', 'EXCEPTION', '')
  ch3.type = 'ACTIVITY'
  ch3.direct_predecessor = 'ch2'
  var ch4 = new EgsmStage('ch4', 'ch4', 'parent', 'EXCEPTION', '')
  ch4.type = 'ACTIVITY'
  ch4.direct_predecessor = 'loop'

  //Parent stages
  var stage1 = new EgsmStage('parent', 'parent', 'NA', 'EXCEPTION', '')
  stage1.type = 'SEQUENCE'
  stage1.direct_predecessor = 'NONE'
  stage1.children = ['ch1', 'loop', 'ch4']

  var iteration = new EgsmStage('iteration', 'iteration', 'loop', 'EXCEPTION', '')
  iteration.type = 'ITERATION'
  iteration.direct_predecessor = 'NA'
  iteration.children = ['ch2', 'ch3']

  var loop = new EgsmStage('loop', 'loop', 'parent', 'EXCEPTION', '')
  loop.type = 'LOOP'
  loop.direct_predecessor = 'ch1'
  loop.children = ['iteration']

  //Setting up the perspective
  var eGSM = new EgsmModel()
  var bpmn = new BpmnModel('pers1')
  eGSM.model_roots.push('parent')
  eGSM.stages.set('parent', stage1)
  eGSM.stages.set('ch1', ch1)
  eGSM.stages.set('loop', loop)
  eGSM.stages.set('iteration', iteration)
  eGSM.stages.set('ch2', ch2)
  eGSM.stages.set('ch3', ch3)
  eGSM.stages.set('ch4', ch4)
  var pers1 = new ProcessPerspective('pers-1')
  pers1.egsm_model = eGSM
  pers1.bpmn_model = bpmn

  //Simulating the process flow
  stage1.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'OPEN', undefined)
  loop.update(undefined, 'OPEN', 'OUTOFORDER')

  iteration.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  ch3.update(undefined, 'OPEN', undefined)
  ch3.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  ch1.update(undefined, 'CLOSED', undefined)

  iteration.update(undefined, 'OPEN', undefined)
  ch1.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'UNOPENED', undefined)
  ch2.update(undefined, 'OPEN', undefined)
  ch2.update(undefined, 'CLOSED', undefined)
  iteration.update(undefined, 'CLOSED', undefined)

  loop.update(undefined, 'CLOSED', undefined)
  ch4.update(undefined, 'OPEN', undefined)
  ch4.update(undefined, 'CLOSED', undefined)

  var expected = [
    new OverlapDeviation(['ch2', 'ch3', 'ch2', 'ch3'], 'ch1', 0, -1)
  ]
  var data = pers1.analyze()
  console.log(data)
  expect(data).toEqual(expected)
})