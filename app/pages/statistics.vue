<!-- app/pages/statistics.vue -->
<script setup>
useHead({
  title: 'Статистика',
})

import { computed, onUnmounted, ref, watch } from 'vue'
import Dexie, { liveQuery } from 'dexie'

/*
  ВАЖНО:
  Схема должна полностью совпадать с app/pages/index.vue и app/pages/add.vue.
*/
class HospitalDb extends Dexie {
  constructor() {
    super('HospitalLocalDB')

    this.version(1).stores({
      cabinets: '++id, name, createdAt',
      zones: '++id, name, price, createdAt',
      cabinetZones:
        '++id, cabinetId, zoneId, [cabinetId+zoneId], cabinetId, zoneId',
    })

    this.version(2).stores({
      cabinets: '++id, name, createdAt',
      zones: '++id, name, price, createdAt',
      cabinetZones:
        '++id, cabinetId, zoneId, [cabinetId+zoneId], cabinetId, zoneId',
      patientCounts: '++id, date, cabinetZoneId, [date+cabinetZoneId]',
    })

    this.version(3).stores({
      cabinets: '++id, name, sortOrder, createdAt',
      zones: '++id, name, price, createdAt',
      cabinetZones:
        '++id, cabinetId, zoneId, [cabinetId+zoneId], cabinetId, zoneId',
      patientCounts: '++id, date, cabinetZoneId, [date+cabinetZoneId]',
    })
  }
}

const db = new HospitalDb()

function useLiveQuery(query, initialValue = []) {
  const data = ref(initialValue)

  const subscription = liveQuery(query).subscribe({
    next(value) {
      data.value = value
    },
    error(error) {
      console.error('Dexie error:', error)
    },
  })

  onUnmounted(() => subscription.unsubscribe())

  return data
}

/* ---------- Дата и месяц ---------- */

function getToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const selectedDate = ref(getToday())
const isLoading = ref(false)
const isMoneyVisible = ref(false)
const monthRecords = ref([])

function getMonthRange(dateString) {
  const [year, month] = dateString.split('-').map(Number)

  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`

  const lastDayDate = new Date(year, month, 0)
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(
    lastDayDate.getDate(),
  ).padStart(2, '0')}`

  return {
    firstDay,
    lastDay,
    title: new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${dateString}T12:00:00`)),
  }
}

const selectedMonthTitle = computed(() => {
  if (!selectedDate.value) return ''
  return getMonthRange(selectedDate.value).title
})

function setToday() {
  selectedDate.value = getToday()
}

function toggleMoneyVisibility() {
  isMoneyVisible.value = !isMoneyVisible.value
}

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(new Date(`${dateString}T12:00:00`))
}

/* ---------- Справочники ---------- */

const cabinets = useLiveQuery(() => db.cabinets.orderBy('name').toArray(), [])

const zones = useLiveQuery(() => db.zones.orderBy('name').toArray(), [])

const cabinetZones = useLiveQuery(() => db.cabinetZones.toArray(), [])

/* ---------- Загрузка месяца ---------- */

async function loadMonthRecords() {
  if (!selectedDate.value) return

  isLoading.value = true

  try {
    const { firstDay, lastDay } = getMonthRange(selectedDate.value)

    monthRecords.value = await db.patientCounts
      .where('date')
      .between(firstDay, lastDay, true, true)
      .toArray()
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

watch(
  selectedDate,
  () => {
    loadMonthRecords()
  },
  { immediate: true },
)

/*
  Чтобы таблицы обновлялись после сохранения пациентов
  на главной странице в другой вкладке/компоненте.
*/
watch(
  () => cabinetZones.value.length,
  () => {
    loadMonthRecords()
  },
)

/* ---------- Поиск связанных объектов ---------- */

function findCabinetZone(cabinetZoneId) {
  return cabinetZones.value.find((link) => link.id === cabinetZoneId)
}

function findCabinet(cabinetId) {
  return cabinets.value.find((cabinet) => cabinet.id === cabinetId)
}

function findZone(zoneId) {
  return zones.value.find((zone) => zone.id === zoneId)
}

function getRecordInfo(record) {
  const link = findCabinetZone(record.cabinetZoneId)

  if (!link) {
    return {
      cabinetId: null,
      cabinetName: 'Удалённый кабинет',
      zoneId: null,
      zoneName: 'Удалённая зона',
      price: 0,
      count: Number(record.count) || 0,
      money: 0,
    }
  }

  const cabinet = findCabinet(link.cabinetId)
  const zone = findZone(link.zoneId)
  const count = Number(record.count) || 0
  const price = Number(zone?.price) || 0

  return {
    cabinetId: link.cabinetId,
    cabinetName: cabinet?.name || 'Удалённый кабинет',
    zoneId: link.zoneId,
    zoneName: zone?.name || 'Удалённая зона',
    price,
    count,
    money: count * price,
  }
}

/* ---------- Общие показатели ---------- */

const monthPatients = computed(() => {
  return monthRecords.value.reduce((sum, record) => {
    return sum + (Number(record.count) || 0)
  }, 0)
})

const monthMoney = computed(() => {
  return monthRecords.value.reduce((sum, record) => {
    return sum + getRecordInfo(record).money
  }, 0)
})

const activeDays = computed(() => {
  const dates = new Set(
    monthRecords.value
      .filter((record) => Number(record.count) > 0)
      .map((record) => record.date),
  )

  return dates.size
})

/* ---------- По дням ---------- */

const dailyStats = computed(() => {
  const { firstDay, lastDay } = getMonthRange(selectedDate.value)

  const allDays = []
  const current = new Date(`${firstDay}T12:00:00`)
  const end = new Date(`${lastDay}T12:00:00`)

  while (current <= end) {
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')

    allDays.push(`${year}-${month}-${day}`)
    current.setDate(current.getDate() + 1)
  }

  return allDays.map((date) => {
    const records = monthRecords.value.filter((record) => record.date === date)

    const patients = records.reduce((sum, record) => {
      return sum + (Number(record.count) || 0)
    }, 0)

    const money = records.reduce((sum, record) => {
      return sum + getRecordInfo(record).money
    }, 0)

    return {
      date,
      label: formatDate(date),
      patients,
      money,
    }
  })
})

/* ---------- По кабинетам ---------- */

const cabinetStats = computed(() => {
  const result = new Map()

  /*
    Включаем все существующие кабинеты, даже если в месяце
    по ним ещё нет ни одного пациента.
  */
  cabinets.value.forEach((cabinet) => {
    result.set(cabinet.id, {
      id: cabinet.id,
      name: cabinet.name,
      patients: 0,
      money: 0,
    })
  })

  monthRecords.value.forEach((record) => {
    const info = getRecordInfo(record)

    if (!info.cabinetId) return

    if (!result.has(info.cabinetId)) {
      result.set(info.cabinetId, {
        id: info.cabinetId,
        name: info.cabinetName,
        patients: 0,
        money: 0,
      })
    }

    const item = result.get(info.cabinetId)
    item.patients += info.count
    item.money += info.money
  })

  return Array.from(result.values()).sort((a, b) => {
    return b.patients - a.patients || a.name.localeCompare(b.name, 'ru')
  })
})

/* ---------- По зонам ---------- */

const zoneStats = computed(() => {
  const result = new Map()

  /*
    Зона может находиться в нескольких кабинетах.
    Здесь она суммируется как одна общая зона.
  */
  zones.value.forEach((zone) => {
    result.set(zone.id, {
      id: zone.id,
      name: zone.name,
      price: Number(zone.price) || 0,
      patients: 0,
      money: 0,
      cabinets: new Set(),
    })
  })

  monthRecords.value.forEach((record) => {
    const info = getRecordInfo(record)

    if (!info.zoneId) return

    if (!result.has(info.zoneId)) {
      result.set(info.zoneId, {
        id: info.zoneId,
        name: info.zoneName,
        price: info.price,
        patients: 0,
        money: 0,
        cabinets: new Set(),
      })
    }

    const item = result.get(info.zoneId)

    item.patients += info.count
    item.money += info.money
    item.cabinets.add(info.cabinetName)
  })

  return Array.from(result.values())
    .map((item) => ({
      ...item,
      cabinetCount: item.cabinets.size,
      cabinetNames: Array.from(item.cabinets).join(', '),
    }))
    .sort((a, b) => {
      return b.patients - a.patients || a.name.localeCompare(b.name, 'ru')
    })
})
</script>

<template>
    <header
      class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
    >
      <div>
        <h1 class="text-2xl font-bold">Статистика</h1>

        <p class="mt-1 text-sm text-gray-500">
          Пациенты и выручка за выбранный месяц.
        </p>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="Любая дата нужного месяца">
          <UInput v-model="selectedDate" type="date" class="w-44" />
        </UFormField>

        <UButton color="neutral" variant="soft" @click="setToday">
          Текущий месяц
        </UButton>

        <UButton
          :icon="isMoneyVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          color="neutral"
          variant="soft"
          :aria-label="isMoneyVisible ? 'Скрыть суммы' : 'Показать суммы'"
          @click="toggleMoneyVisibility"
        >
          {{ isMoneyVisible ? 'Скрыть суммы' : 'Показать суммы' }}
        </UButton>
      </div>
    </header>

    <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
        <p class="text-sm text-gray-500">Всего пациентов</p>

        <p class="mt-1 text-2xl font-bold">
          {{ monthPatients }}
        </p>

        <p class="mt-1 text-xs text-gray-500">За {{ selectedMonthTitle }}</p>
      </UCard>

      <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
        <p class="text-sm text-gray-500">Выручка за месяц</p>

        <p class="mt-1 text-2xl font-bold">
          {{ isMoneyVisible ? formatMoney(monthMoney) : '••••••' }}
        </p>

        <p class="mt-1 text-xs text-gray-500">За {{ selectedMonthTitle }}</p>
      </UCard>

      <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
        <p class="text-sm text-gray-500">Рабочих дней</p>

        <p class="mt-1 text-2xl font-bold">
          {{ activeDays }}
        </p>

        <p class="mt-1 text-xs text-gray-500">Дни с пациентами</p>
      </UCard>

      <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden"А>
        <p class="text-sm text-gray-500">Среднее за рабочий день</p>

        <p class="mt-1 text-2xl font-bold">
          {{ activeDays ? Math.round(monthPatients / activeDays) : 0 }}
        </p>

        <p class="mt-1 text-xs text-gray-500">Пациентов</p>
      </UCard>
    </div>

    <div v-if="isLoading" class="py-12 text-center text-sm text-gray-500">
      Загружаю статистику…
    </div>

    <template v-else>
      <section class="mb-8">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-semibold">По дням</h2>

            <p class="text-sm text-gray-500">
              Итоговое количество пациентов и выручка за каждый день.
            </p>
          </div>
        </div>

        <div
          class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800"
        >
          <table class="w-full min-w-150 text-sm">
            <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
              <tr>
                <th class="px-4 py-3 font-medium">Дата</th>
                <th class="px-4 py-3 text-right font-medium">Пациентов</th>
                <th class="px-4 py-3 text-right font-medium">Сумма</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr
                v-for="day in dailyStats"
                :key="day.date"
                :class="day.patients ? '' : 'text-gray-400'"
              >
                <td class="px-4 py-2">
                  {{ day.label }}
                </td>

                <td class="px-4 py-2 text-right font-medium">
                  {{ day.patients }}
                </td>

                <td class="px-4 py-2 text-right">
                  {{ isMoneyVisible ? formatMoney(day.money) : '••••••' }}
                </td>
              </tr>
            </tbody>

            <tfoot class="bg-gray-50 font-semibold dark:bg-gray-900/40">
              <tr>
                <td class="px-4 py-3">Итого</td>
                <td class="px-4 py-3 text-right">{{ monthPatients }}</td>
                <td class="px-4 py-3 text-right">
                  {{ isMoneyVisible ? formatMoney(monthMoney) : '••••••' }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="mb-8">
        <div class="mb-3">
          <h2 class="text-xl font-semibold">По кабинетам</h2>

          <p class="text-sm text-gray-500">
            Итоги по всем зонам каждого кабинета за {{ selectedMonthTitle }}.
          </p>
        </div>

        <div
          class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800"
        >
          <table class="w-full min-w-150 text-sm">
            <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
              <tr>
                <th class="px-4 py-3 font-medium">Кабинет</th>
                <th class="px-4 py-3 text-right font-medium">Пациентов</th>
                <th class="px-4 py-3 text-right font-medium">Выручка</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="cabinet in cabinetStats" :key="cabinet.id">
                <td class="px-4 py-2 font-medium">
                  {{ cabinet.name }}
                </td>

                <td class="px-4 py-2 text-right">
                  {{ cabinet.patients }}
                </td>

                <td class="px-4 py-2 text-right">
                  {{ isMoneyVisible ? formatMoney(cabinet.money) : '••••••' }}
                </td>
              </tr>
            </tbody>

            <tfoot class="bg-gray-50 font-semibold dark:bg-gray-900/40">
              <tr>
                <td class="px-4 py-3">Итого</td>
                <td class="px-4 py-3 text-right">{{ monthPatients }}</td>
                <td class="px-4 py-3 text-right">
                  {{ isMoneyVisible ? formatMoney(monthMoney) : '••••••' }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <div class="mb-3">
          <h2 class="text-xl font-semibold">По зонам</h2>

          <p class="text-sm text-gray-500">
            Общие итоги зон во всех кабинетах за {{ selectedMonthTitle }}.
          </p>
        </div>

        <div
          class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800"
        >
          <table class="w-full min-w-190 text-sm">
            <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
              <tr>
                <th class="px-4 py-3 font-medium">Зона</th>
                <th class="px-4 py-3 font-medium">Кабинеты</th>
                <th class="px-4 py-3 text-right font-medium">Цена</th>
                <th class="px-4 py-3 text-right font-medium">Пациентов</th>
                <th class="px-4 py-3 text-right font-medium">Выручка</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="zone in zoneStats" :key="zone.id">
                <td class="px-4 py-2 font-medium">
                  {{ zone.name }}
                </td>

                <td class="max-w-80 px-4 py-2 text-gray-500">
                  <span :title="zone.cabinetNames">
                    {{ zone.cabinetNames || 'Нет привязок' }}
                  </span>
                </td>

                <td class="px-4 py-2 text-right">
                  {{ isMoneyVisible ? formatMoney(zone.price) : '••••••' }}
                </td>

                <td class="px-4 py-2 text-right">
                  {{ zone.patients }}
                </td>

                <td class="px-4 py-2 text-right">
                  {{ isMoneyVisible ? formatMoney(zone.money) : '••••••' }}
                </td>
              </tr>
            </tbody>

            <tfoot class="bg-gray-50 font-semibold dark:bg-gray-900/40">
              <tr>
                <td class="px-4 py-3" colspan="3">Итого</td>
                <td class="px-4 py-3 text-right">{{ monthPatients }}</td>
                <td class="px-4 py-3 text-right">
                  {{ isMoneyVisible ? formatMoney(monthMoney) : '••••••' }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <UAlert
        v-if="!monthRecords.length"
        class="mt-6"
        color="neutral"
        variant="subtle"
        title="За этот месяц ещё нет данных"
        :description="`Введите и сохраните пациентов за дни ${selectedMonthTitle} на главной странице.`"
      />
    </template>
</template>
