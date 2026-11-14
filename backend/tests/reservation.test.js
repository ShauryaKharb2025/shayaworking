require('dotenv').config();
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const db = require('../src/data/prisma');
const {reserveAutoDispatch} = require('../src/services/reservationService');
after(() => db.$disconnect());
test('automatic reservation commits both records and rolls back an ineligible trip', async () => {
  const tag = randomUUID();
  const user = await db.user.create({data:{name:'Test',email:tag+'@test.invalid',role:'driver'}});
  const operator = await db.operator.create({data:{name:tag,type:'ngo'}});
  const ambulance = await db.ambulance.create({data:{vehicleNumber:tag,operatorId:operator.id,status:'idle'}});
  const trip = await db.trip.create({data:{patientId:user.id,pickupLocation:{coordinates:[77,28]},status:'cancelled',autoDispatchAt:new Date(0)}});
  try {
    await assert.rejects(reserveAutoDispatch(trip.id,ambulance.id,user.id),/already assigned/);
    assert.equal((await db.ambulance.findUnique({where:{id:ambulance.id}})).status,'idle');
    await db.trip.update({where:{id:trip.id},data:{status:'requested'}});
    assert.equal(await reserveAutoDispatch(trip.id,ambulance.id,user.id),true);
    assert.equal((await db.trip.findUnique({where:{id:trip.id}})).ambulanceId,ambulance.id);
  } finally {
    await db.trip.delete({where:{id:trip.id}});
    await db.ambulance.delete({where:{id:ambulance.id}});
    await db.user.delete({where:{id:user.id}});
    await db.operator.delete({where:{id:operator.id}});
  }
});
