<!-- app/pages/statistics.vue -->
<script setup>
useHead({
  title: 'Статистика',
})

import { liveQuery } from 'dexie'

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

/* ---------- Утилиты дат ---------- */

function pad(n) {
  return String(n).padStart(2, '0')
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getToday() {
  return toDateString(new Date())
}

function parseDate(dateString) {
  return new Date(`${dateString}T12:00:00`)
}

function addDays(dateString, days) {
  const d = parseDate(dateString)
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

function startOfWeek(dateString) {
  const d = parseDate(dateString)
  const day = (d.getDay() + 6) % 7 // Пн = 0
  d.setDate(d.getDate() - day)
  return toDateString(d)
}

function endOfWeek(dateString) {
  return addDays(startOfWeek(dateString), 6)
}

function startOfMonth(dateString) {
  const [y, m] = dateString.split('-').map(Number)
  return `${y}-${pad(m)}-01`
}

function endOfMonth(dateString) {
  const [y, m] = dateString.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${y}-${pad(m)}-${pad(last)}`
}

function startOfQuarter(dateString) {
  const [y, m] = dateString.split('-').map(Number)
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1
  return `${y}-${pad(qStartMonth)}-01`
}

function endOfQuarter(dateString) {
  const [y, m] = dateString.split('-').map(Number)
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1
  const qEndMonth = qStartMonth + 2
  const last = new Date(y, qEndMonth, 0).getDate()
  return `${y}-${pad(qEndMonth)}-${pad(last)}`
}

function startOfYear(dateString) {
  const [y] = dateString.split('-').map(Number)
  return `${y}-01-01`
}

function endOfYear(dateString) {
  const [y] = dateString.split('-').map(Number)
  return `${y}-12-31`
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function getWeekdayIndex(dateString) {
  const d = parseDate(dateString)
  return (d.getDay() + 6) % 7
}

/* ---------- Формат ---------- */

const isMoneyVisible = ref(false)

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
  }).format(parseDate(dateString))
}

function formatDateShort(dateString) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parseDate(dateString))
}

/* ---------- Справочники ---------- */

const cabinets = useLiveQuery(() => db.cabinets.orderBy('name').toArray(), [])
const zones = useLiveQuery(() => db.zones.orderBy('name').toArray(), [])
const cabinetZones = useLiveQuery(() => db.cabinetZones.toArray(), [])

/* ---------- Фильтры ---------- */

const rangeFrom = ref(startOfMonth(getToday()))
const rangeTo = ref(endOfMonth(getToday()))
const activePreset = ref('month')

const selectedCabinetIds = ref([]) // пусто = все
const selectedZoneIds = ref([]) // пусто = все

const cabinetOptions = computed(() =>
  cabinets.value.map((c) => ({ label: c.name, value: c.id })),
)

const zoneOptions = computed(() =>
  zones.value.map((z) => ({ label: z.name, value: z.id })),
)

function applyPreset(preset) {
  const today = getToday()
  activePreset.value = preset

  if (preset === 'today') {
    rangeFrom.value = today
    rangeTo.value = today
  } else if (preset === 'week') {
    rangeFrom.value = startOfWeek(today)
    rangeTo.value = endOfWeek(today)
  } else if (preset === 'month') {
    rangeFrom.value = startOfMonth(today)
    rangeTo.value = endOfMonth(today)
  } else if (preset === 'prevMonth') {
    const prevMonthAnchor = addDays(startOfMonth(today), -1)
    rangeFrom.value = startOfMonth(prevMonthAnchor)
    rangeTo.value = endOfMonth(prevMonthAnchor)
  } else if (preset === 'quarter') {
    rangeFrom.value = startOfQuarter(today)
    rangeTo.value = endOfQuarter(today)
  } else if (preset === 'year') {
    rangeFrom.value = startOfYear(today)
    rangeTo.value = endOfYear(today)
  }
}

function resetFilters() {
  applyPreset('month')
  selectedCabinetIds.value = []
  selectedZoneIds.value = []
}

watch([rangeFrom, rangeTo], () => {
  activePreset.value = 'custom'
})

const rangeTitle = computed(() => {
  if (!rangeFrom.value || !rangeTo.value) return ''
  if (rangeFrom.value === rangeTo.value) return formatDateShort(rangeFrom.value)
  return `${formatDateShort(rangeFrom.value)} — ${formatDateShort(rangeTo.value)}`
})

/* ---------- Загрузка периода ---------- */

const isLoading = ref(false)
const periodRecords = ref([])

async function loadPeriodRecords() {
  if (!rangeFrom.value || !rangeTo.value) return

  isLoading.value = true

  try {
    const from = rangeFrom.value <= rangeTo.value ? rangeFrom.value : rangeTo.value
    const to = rangeFrom.value <= rangeTo.value ? rangeTo.value : rangeFrom.value

    periodRecords.value = await db.patientCounts
      .where('date')
      .between(from, to, true, true)
      .toArray()
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

watch([rangeFrom, rangeTo], loadPeriodRecords, { immediate: true })

/*
  Чтобы таблицы обновлялись после сохранения пациентов
  на главной странице в другой вкладке/компоненте.
*/
watch(
  () => cabinetZones.value.length,
  () => loadPeriodRecords(),
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

/* ---------- Применение фильтров кабинетов/зон ---------- */

const filteredRecords = computed(() => {
  const cabinetFilterOn = selectedCabinetIds.value.length > 0
  const zoneFilterOn = selectedZoneIds.value.length > 0

  if (!cabinetFilterOn && !zoneFilterOn) return periodRecords.value

  return periodRecords.value.filter((record) => {
    const info = getRecordInfo(record)

    if (cabinetFilterOn && !selectedCabinetIds.value.includes(info.cabinetId)) {
      return false
    }

    if (zoneFilterOn && !selectedZoneIds.value.includes(info.zoneId)) {
      return false
    }

    return true
  })
})

const hasActiveFilters = computed(
  () => selectedCabinetIds.value.length > 0 || selectedZoneIds.value.length > 0,
)

/* ---------- Общие показатели ---------- */

const totalPatients = computed(() =>
  filteredRecords.value.reduce((sum, r) => sum + (Number(r.count) || 0), 0),
)

const totalMoney = computed(() =>
  filteredRecords.value.reduce((sum, r) => sum + getRecordInfo(r).money, 0),
)

const activeDatesSet = computed(() => {
  return new Set(
    filteredRecords.value
      .filter((r) => Number(r.count) > 0)
      .map((r) => r.date),
  )
})

const activeDays = computed(() => activeDatesSet.value.size)

const calendarDaysCount = computed(() => {
  if (!rangeFrom.value || !rangeTo.value) return 0
  const from = parseDate(rangeFrom.value <= rangeTo.value ? rangeFrom.value : rangeTo.value)
  const to = parseDate(rangeFrom.value <= rangeTo.value ? rangeTo.value : rangeFrom.value)
  return Math.round((to - from) / 86400000) + 1
})

const avgPerActiveDay = computed(() =>
  activeDays.value ? totalPatients.value / activeDays.value : 0,
)

const avgPerCalendarDay = computed(() =>
  calendarDaysCount.value ? totalPatients.value / calendarDaysCount.value : 0,
)

const avgCheck = computed(() =>
  totalPatients.value ? totalMoney.value / totalPatients.value : 0,
)

/* ---------- По дням ---------- */

const dailyStats = computed(() => {
  if (!rangeFrom.value || !rangeTo.value) return []

  const from = rangeFrom.value <= rangeTo.value ? rangeFrom.value : rangeTo.value
  const to = rangeFrom.value <= rangeTo.value ? rangeTo.value : rangeFrom.value

  const allDays = []
  let cursor = from

  while (cursor <= to) {
    allDays.push(cursor)
    cursor = addDays(cursor, 1)
  }

  return allDays.map((date) => {
    const records = filteredRecords.value.filter((r) => r.date === date)

    const patients = records.reduce((sum, r) => sum + (Number(r.count) || 0), 0)
    const money = records.reduce((sum, r) => sum + getRecordInfo(r).money, 0)

    return {
      date,
      label: formatDate(date),
      weekday: WEEKDAY_LABELS[getWeekdayIndex(date)],
      patients,
      money,
    }
  })
})

const bestDay = computed(() => {
  const withPatients = dailyStats.value.filter((d) => d.patients > 0)
  if (!withPatients.length) return null
  return withPatients.reduce((a, b) => (b.patients > a.patients ? b : a))
})

const worstDay = computed(() => {
  const withPatients = dailyStats.value.filter((d) => d.patients > 0)
  if (!withPatients.length) return null
  return withPatients.reduce((a, b) => (b.patients < a.patients ? b : a))
})

/* ---------- По дням недели ---------- */

const weekdayStats = computed(() => {
  const buckets = WEEKDAY_LABELS.map((label) => ({
    label,
    patients: 0,
    money: 0,
    daysCount: 0,
    activeDaysCount: 0,
  }))

  dailyStats.value.forEach((day) => {
    const idx = getWeekdayIndex(day.date)
    const bucket = buckets[idx]
    bucket.daysCount += 1
    bucket.patients += day.patients
    bucket.money += day.money
    if (day.patients > 0) bucket.activeDaysCount += 1
  })

  return buckets.map((bucket) => ({
    ...bucket,
    avgPerDay: bucket.activeDaysCount
      ? bucket.patients / bucket.activeDaysCount
      : 0,
  }))
})

/* ---------- По кабинетам ---------- */

const cabinetStats = computed(() => {
  const result = new Map()

  const cabinetFilterOn = selectedCabinetIds.value.length > 0

  cabinets.value
    .filter((c) => !cabinetFilterOn || selectedCabinetIds.value.includes(c.id))
    .forEach((cabinet) => {
      result.set(cabinet.id, {
        id: cabinet.id,
        name: cabinet.name,
        patients: 0,
        money: 0,
        zones: new Map(),
      })
    })

  cabinetZones.value
    .filter((link) => !cabinetFilterOn || selectedCabinetIds.value.includes(link.cabinetId))
    .filter((link) => selectedZoneIds.value.length === 0 || selectedZoneIds.value.includes(link.zoneId))
    .forEach((link) => {
      const cabinet = findCabinet(link.cabinetId)
      const zone = findZone(link.zoneId)

      if (!result.has(link.cabinetId)) {
        result.set(link.cabinetId, {
          id: link.cabinetId,
          name: cabinet?.name || 'Удалённый кабинет',
          patients: 0,
          money: 0,
          zones: new Map(),
        })
      }

      const cabinetItem = result.get(link.cabinetId)

      cabinetItem.zones.set(link.id, {
        id: link.id,
        name: zone?.name || 'Удалённая зона',
        patients: 0,
        money: 0,
      })
    })

  filteredRecords.value.forEach((record) => {
    const info = getRecordInfo(record)

    if (!info.cabinetId) return

    if (!result.has(info.cabinetId)) {
      result.set(info.cabinetId, {
        id: info.cabinetId,
        name: info.cabinetName,
        patients: 0,
        money: 0,
        zones: new Map(),
      })
    }

    const cabinetItem = result.get(info.cabinetId)

    if (!cabinetItem.zones.has(record.cabinetZoneId)) {
      cabinetItem.zones.set(record.cabinetZoneId, {
        id: record.cabinetZoneId,
        name: info.zoneName,
        patients: 0,
        money: 0,
      })
    }

    const zoneItem = cabinetItem.zones.get(record.cabinetZoneId)

    cabinetItem.patients += info.count
    cabinetItem.money += info.money

    zoneItem.patients += info.count
    zoneItem.money += info.money
  })

  return Array.from(result.values())
    .map((cabinet) => ({
      ...cabinet,
      share: totalPatients.value ? (cabinet.patients / totalPatients.value) * 100 : 0,
      zones: Array.from(cabinet.zones.values()).sort((a, b) => {
        return b.patients - a.patients || a.name.localeCompare(b.name, 'ru')
      }),
    }))
    .sort((a, b) => {
      return b.patients - a.patients || a.name.localeCompare(b.name, 'ru')
    })
})

/* ---------- По зонам ---------- */

const zoneStats = computed(() => {
  const result = new Map()

  const zoneFilterOn = selectedZoneIds.value.length > 0

  zones.value
    .filter((z) => !zoneFilterOn || selectedZoneIds.value.includes(z.id))
    .forEach((zone) => {
      result.set(zone.id, {
        id: zone.id,
        name: zone.name,
        price: Number(zone.price) || 0,
        patients: 0,
        money: 0,
        cabinets: new Set(),
      })
    })

  filteredRecords.value.forEach((record) => {
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
      share: totalPatients.value ? (item.patients / totalPatients.value) * 100 : 0,
      cabinetCount: item.cabinets.size,
      cabinetNames: Array.from(item.cabinets).join(', '),
    }))
    .sort((a, b) => {
      return b.patients - a.patients || a.name.localeCompare(b.name, 'ru')
    })
})

/* ---------- Матрица кабинет x зона ---------- */

const matrixZones = computed(() => {
  const zoneFilterOn = selectedZoneIds.value.length > 0
  return zones.value.filter((z) => !zoneFilterOn || selectedZoneIds.value.includes(z.id))
})

const matrixCabinets = computed(() => cabinetStats.value)

function matrixCell(cabinet, zoneId) {
  const found = cabinet.zones.find((z) => {
    const link = cabinetZones.value.find((l) => l.id === z.id)
    return link?.zoneId === zoneId
  })
  return found || null
}
</script>

<template>
  <header class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <h1 class="text-2xl font-bold">Статистика</h1>
      <p class="mt-1 text-sm text-gray-500">
        Подробная статистика пациентов и выручки с фильтрами по периоду, кабинетам и зонам.
      </p>
    </div>

    <UButton
      :icon="isMoneyVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
      color="neutral"
      variant="soft"
      :aria-label="isMoneyVisible ? 'Скрыть суммы' : 'Показать суммы'"
      @click="toggleMoneyVisibility"
    >
      {{ isMoneyVisible ? 'Скрыть суммы' : 'Показать суммы' }}
    </UButton>
  </header>

  <UCard class="apple-glass-soft apple-glass-inset mb-6 rounded-3xl overflow-hidden">
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-2">
        <UButton
          v-for="preset in [
            { key: 'today', label: 'Сегодня' },
            { key: 'week', label: 'Эта неделя' },
            { key: 'month', label: 'Этот месяц' },
            { key: 'prevMonth', label: 'Прошлый месяц' },
            { key: 'quarter', label: 'Квартал' },
            { key: 'year', label: 'Год' },
          ]"
          :key="preset.key"
          size="sm"
          :color="activePreset === preset.key ? 'primary' : 'neutral'"
          :variant="activePreset === preset.key ? 'solid' : 'soft'"
          @click="applyPreset(preset.key)"
        >
          {{ preset.label }}
        </UButton>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Дата с">
          <UInput v-model="rangeFrom" type="date" class="w-44" />
        </UFormField>

        <UFormField label="Дата по">
          <UInput v-model="rangeTo" type="date" class="w-44" />
        </UFormField>

        <UFormField label="Кабинеты" class="min-w-56">
          <USelectMenu
            v-model="selectedCabinetIds"
            :items="cabinetOptions"
            value-key="value"
            multiple
            placeholder="Все кабинеты"
            class="w-56"
          />
        </UFormField>

        <UFormField label="Зоны" class="min-w-56">
          <USelectMenu
            v-model="selectedZoneIds"
            :items="zoneOptions"
            value-key="value"
            multiple
            placeholder="Все зоны"
            class="w-56"
          />
        </UFormField>

        <UButton color="neutral" variant="soft" @click="resetFilters">
          Сбросить фильтры
        </UButton>
      </div>

      <p class="text-xs text-gray-500">
        Период: {{ rangeTitle }} ({{ calendarDaysCount }} дн.)
        <span v-if="hasActiveFilters"> · применены фильтры по кабинетам/зонам</span>
      </p>
    </div>
  </UCard>

  <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Всего пациентов</p>
      <p class="mt-1 text-2xl font-bold">{{ totalPatients }}</p>
      <p class="mt-1 text-xs text-gray-500">За {{ rangeTitle }}</p>
    </UCard>

    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Выручка за период</p>
      <p class="mt-1 text-2xl font-bold">
        {{ isMoneyVisible ? formatMoney(totalMoney) : '••••••' }}
      </p>
      <p class="mt-1 text-xs text-gray-500">За {{ rangeTitle }}</p>
    </UCard>

    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Рабочих дней</p>
      <p class="mt-1 text-2xl font-bold">{{ activeDays }} / {{ calendarDaysCount }}</p>
      <p class="mt-1 text-xs text-gray-500">Дни с пациентами / всего дней</p>
    </UCard>

    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Средний чек</p>
      <p class="mt-1 text-2xl font-bold">
        {{ isMoneyVisible ? formatMoney(avgCheck) : '••••••' }}
      </p>
      <p class="mt-1 text-xs text-gray-500">Выручка / пациент</p>
    </UCard>

    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Среднее за рабочий день</p>
      <p class="mt-1 text-2xl font-bold">{{ Math.round(avgPerActiveDay) }}</p>
      <p class="mt-1 text-xs text-gray-500">Пациентов</p>
    </UCard>

    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Среднее за календарный день</p>
      <p class="mt-1 text-2xl font-bold">{{ avgPerCalendarDay.toFixed(1) }}</p>
      <p class="mt-1 text-xs text-gray-500">Пациентов</p>
    </UCard>

    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Лучший день</p>
      <p class="mt-1 text-2xl font-bold">{{ bestDay ? bestDay.patients : '—' }}</p>
      <p class="mt-1 text-xs text-gray-500">{{ bestDay ? bestDay.label : 'Нет данных' }}</p>
    </UCard>

    <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
      <p class="text-sm text-gray-500">Худший рабочий день</p>
      <p class="mt-1 text-2xl font-bold">{{ worstDay ? worstDay.patients : '—' }}</p>
      <p class="mt-1 text-xs text-gray-500">{{ worstDay ? worstDay.label : 'Нет данных' }}</p>
    </UCard>
  </div>

  <div v-if="isLoading" class="py-12 text-center text-sm text-gray-500">
    Загружаю статистику…
  </div>

  <template v-else>
    <section class="mb-8">
      <div class="mb-3">
        <h2 class="text-xl font-semibold">По дням</h2>
        <p class="text-sm text-gray-500">
          Итоговое количество пациентов и выручка за каждый день периода.
        </p>
      </div>

      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table class="w-full min-w-150 text-sm">
          <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
            <tr>
              <th class="px-4 py-3 font-medium">Дата</th>
              <th class="px-4 py-3 font-medium">День недели</th>
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
              <td class="px-4 py-2">{{ day.label }}</td>
              <td class="px-4 py-2">{{ day.weekday }}</td>
              <td class="px-4 py-2 text-right font-medium">{{ day.patients }}</td>
              <td class="px-4 py-2 text-right">
                {{ isMoneyVisible ? formatMoney(day.money) : '••••••' }}
              </td>
            </tr>
          </tbody>

          <tfoot class="bg-gray-50 font-semibold dark:bg-gray-900/40">
            <tr>
              <td class="px-4 py-3" colspan="2">Итого</td>
              <td class="px-4 py-3 text-right">{{ totalPatients }}</td>
              <td class="px-4 py-3 text-right">
                {{ isMoneyVisible ? formatMoney(totalMoney) : '••••••' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section class="mb-8">
      <div class="mb-3">
        <h2 class="text-xl font-semibold">По дням недели</h2>
        <p class="text-sm text-gray-500">
          Суммарно и в среднем по каждому дню недели за период.
        </p>
      </div>

      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table class="w-full min-w-150 text-sm">
          <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
            <tr>
              <th class="px-4 py-3 font-medium">День недели</th>
              <th class="px-4 py-3 text-right font-medium">Дней в периоде</th>
              <th class="px-4 py-3 text-right font-medium">Рабочих дней</th>
              <th class="px-4 py-3 text-right font-medium">Пациентов всего</th>
              <th class="px-4 py-3 text-right font-medium">Среднее в раб. день</th>
              <th class="px-4 py-3 text-right font-medium">Выручка</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="wd in weekdayStats" :key="wd.label">
              <td class="px-4 py-2 font-medium">{{ wd.label }}</td>
              <td class="px-4 py-2 text-right">{{ wd.daysCount }}</td>
              <td class="px-4 py-2 text-right">{{ wd.activeDaysCount }}</td>
              <td class="px-4 py-2 text-right">{{ wd.patients }}</td>
              <td class="px-4 py-2 text-right">{{ wd.avgPerDay.toFixed(1) }}</td>
              <td class="px-4 py-2 text-right">
                {{ isMoneyVisible ? formatMoney(wd.money) : '••••••' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="mb-8">
      <div class="mb-3">
        <h2 class="text-xl font-semibold">По кабинетам</h2>
        <p class="text-sm text-gray-500">
          Итоги по всем зонам каждого кабинета за {{ rangeTitle }}, с учётом фильтров.
        </p>
      </div>

      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table class="w-full min-w-190 text-sm">
          <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
            <tr>
              <th class="px-4 py-3 font-medium">Кабинет</th>
              <th class="px-4 py-3 font-medium">Зоны</th>
              <th class="px-4 py-3 text-right font-medium">Пациентов</th>
              <th class="px-4 py-3 text-right font-medium">Доля, %</th>
              <th class="px-4 py-3 text-right font-medium">Выручка</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="cabinet in cabinetStats" :key="cabinet.id">
              <td class="px-4 py-2 font-medium">{{ cabinet.name }}</td>

              <td class="min-w-70 px-4 py-2">
                <div v-if="cabinet.zones.length" class="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <span
                    v-for="zone in cabinet.zones"
                    :key="zone.id"
                    class="whitespace-nowrap text-gray-500"
                  >
                    {{ zone.name }}:
                    <span class="font-medium text-gray-900 dark:text-gray-100">
                      {{ zone.patients }}
                    </span>
                  </span>
                </div>
                <span v-else class="text-gray-400">Нет привязок</span>
              </td>

              <td class="px-4 py-2 text-right">{{ cabinet.patients }}</td>
              <td class="px-4 py-2 text-right">{{ cabinet.share.toFixed(1) }}%</td>
              <td class="px-4 py-2 text-right">
                {{ isMoneyVisible ? formatMoney(cabinet.money) : '••••••' }}
              </td>
            </tr>
          </tbody>

          <tfoot class="bg-gray-50 font-semibold dark:bg-gray-900/40">
            <tr>
              <td class="px-4 py-3">Итого</td>
              <td class="px-4 py-3"></td>
              <td class="px-4 py-3 text-right">{{ totalPatients }}</td>
              <td class="px-4 py-3 text-right">100%</td>
              <td class="px-4 py-3 text-right">
                {{ isMoneyVisible ? formatMoney(totalMoney) : '••••••' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section class="mb-8">
      <div class="mb-3">
        <h2 class="text-xl font-semibold">По зонам</h2>
        <p class="text-sm text-gray-500">
          Общие итоги зон во всех кабинетах за {{ rangeTitle }}, с учётом фильтров.
        </p>
      </div>

      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table class="w-full min-w-190 text-sm">
          <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
            <tr>
              <th class="px-4 py-3 font-medium">Зона</th>
              <th class="px-4 py-3 font-medium">Кабинеты</th>
              <th class="px-4 py-3 text-right font-medium">Цена</th>
              <th class="px-4 py-3 text-right font-medium">Пациентов</th>
              <th class="px-4 py-3 text-right font-medium">Доля, %</th>
              <th class="px-4 py-3 text-right font-medium">Выручка</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="zone in zoneStats" :key="zone.id">
              <td class="px-4 py-2 font-medium">{{ zone.name }}</td>

              <td class="max-w-80 px-4 py-2 text-gray-500">
                <span :title="zone.cabinetNames">
                  {{ zone.cabinetNames || 'Нет привязок' }}
                </span>
              </td>

              <td class="px-4 py-2 text-right">
                {{ isMoneyVisible ? formatMoney(zone.price) : '••••••' }}
              </td>

              <td class="px-4 py-2 text-right">{{ zone.patients }}</td>
              <td class="px-4 py-2 text-right">{{ zone.share.toFixed(1) }}%</td>

              <td class="px-4 py-2 text-right">
                {{ isMoneyVisible ? formatMoney(zone.money) : '••••••' }}
              </td>
            </tr>
          </tbody>

          <tfoot class="bg-gray-50 font-semibold dark:bg-gray-900/40">
            <tr>
              <td class="px-4 py-3" colspan="3">Итого</td>
              <td class="px-4 py-3 text-right">{{ totalPatients }}</td>
              <td class="px-4 py-3 text-right">100%</td>
              <td class="px-4 py-3 text-right">
                {{ isMoneyVisible ? formatMoney(totalMoney) : '••••••' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section class="mb-8">
      <div class="mb-3">
        <h2 class="text-xl font-semibold">Матрица «Кабинет × Зона»</h2>
        <p class="text-sm text-gray-500">
          Количество пациентов по каждой паре кабинет/зона за {{ rangeTitle }}.
        </p>
      </div>

      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table class="w-full min-w-190 text-sm">
          <thead class="bg-gray-50 text-left dark:bg-gray-900/40">
            <tr>
              <th class="px-4 py-3 font-medium">Кабинет \ Зона</th>
              <th
                v-for="zone in matrixZones"
                :key="zone.id"
                class="px-4 py-3 text-right font-medium"
              >
                {{ zone.name }}
              </th>
              <th class="px-4 py-3 text-right font-medium">Итого</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="cabinet in matrixCabinets" :key="cabinet.id">
              <td class="px-4 py-2 font-medium">{{ cabinet.name }}</td>

              <td
                v-for="zone in matrixZones"
                :key="zone.id"
                class="px-4 py-2 text-right"
              >
                {{ matrixCell(cabinet, zone.id)?.patients ?? 0 }}
              </td>

              <td class="px-4 py-2 text-right font-semibold">{{ cabinet.patients }}</td>
            </tr>
          </tbody>

          <tfoot class="bg-gray-50 font-semibold dark:bg-gray-900/40">
            <tr>
              <td class="px-4 py-3">Итого</td>
              <td
                v-for="zone in matrixZones"
                :key="zone.id"
                class="px-4 py-3 text-right"
              >
                {{ zoneStats.find((z) => z.id === zone.id)?.patients ?? 0 }}
              </td>
              <td class="px-4 py-3 text-right">{{ totalPatients }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <UAlert
      v-if="!filteredRecords.length"
      class="mt-6"
      color="neutral"
      variant="subtle"
      title="За выбранный период и фильтры нет данных"
      description="Измените диапазон дат или фильтры по кабинетам/зонам, либо введите пациентов на главной странице."
    />
  </template>
</template>