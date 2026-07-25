import Dexie from 'dexie'

class HospitalDb extends Dexie {
  constructor() {
    super('HospitalLocalDB')

    this.version(1).stores({
      cabinets: '++id, name, createdAt',
      zones: '++id, name, price, createdAt',
      cabinetZones: '++id, cabinetId, zoneId, [cabinetId+zoneId]'
    })

    this.version(2).stores({
      cabinets: '++id, name, createdAt',
      zones: '++id, name, price, createdAt',
      cabinetZones: '++id, cabinetId, zoneId, [cabinetId+zoneId]',
      patientCounts: '++id, date, cabinetZoneId, [date+cabinetZoneId]'
    })

    this.version(3).stores({
      cabinets: '++id, name, sortOrder, createdAt',
      zones: '++id, name, price, createdAt',
      cabinetZones: '++id, cabinetId, zoneId, [cabinetId+zoneId]',
      patientCounts: '++id, date, cabinetZoneId, [date+cabinetZoneId]'
    })
  }
}

export const db = import.meta.client ? new HospitalDb() : null