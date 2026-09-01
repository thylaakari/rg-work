<!-- app/pages/index.vue -->
<script setup>
useHead({
  title: 'Главная',
})
import { liveQuery } from 'dexie'

const isMoneyVisible = ref(false)

function toggleMoneyVisibility() {
  isMoneyVisible.value = !isMoneyVisible.value
}

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

/* ---------- Дата ---------- */

function getToday() {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const selectedDate = ref(getToday())

const selectedDateLabel = computed(() => {
  if (!selectedDate.value) return ''

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${selectedDate.value}T12:00:00`))
})

function setToday() {
  selectedDate.value = getToday()
}

/* ---------- Данные справочников ---------- */

const cabinets = useLiveQuery(() => db.cabinets.orderBy('name').toArray(), [])

const zones = useLiveQuery(() => db.zones.toArray(), [])

const cabinetZones = useLiveQuery(() => db.cabinetZones.toArray(), [])

const patientInputs = reactive({})

const savedCounts = ref([])
const monthCounts = ref([])
const isLoading = ref(false)
const isSaving = ref(false)
const savedMessage = ref('')
const draggedCabinetId = ref(null)
const dragOverCabinetId = ref(null)

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

const monthMoney = computed(() => {
  return monthCounts.value.reduce((total, record) => {
    const cabinetZone = cabinetZones.value.find(
      (link) => link.id === record.cabinetZoneId,
    )

    if (!cabinetZone) return total

    const zone = zones.value.find((item) => item.id === cabinetZone.zoneId)

    if (!zone) return total

    return total + (Number(record.count) || 0) * (Number(zone.price) || 0)
  }, 0)
})

async function loadMonthCounts() {
  if (!selectedDate.value) return

  const { firstDay, lastDay } = getMonthRange(selectedDate.value)

  monthCounts.value = await db.patientCounts
    .where('date')
    .between(firstDay, lastDay, true, true)
    .toArray()
}

/* ---------- Отображение кабинетов ---------- */

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function getZone(zoneId) {
  return zones.value.find((zone) => zone.id === zoneId)
}

function getZonesForCabinet(cabinetId) {
  return cabinetZones.value
    .filter((link) => link.cabinetId === cabinetId)
    .map((link) => {
      const zone = getZone(link.zoneId)

      return {
        cabinetZoneId: link.id,
        zoneId: link.zoneId,
        name: zone?.name || 'Удалённая зона',
        price: zone?.price || 0,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

const cabinetsWithZones = computed(() => {
  return [...cabinets.value]
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.sortOrder)
        ? a.sortOrder
        : Number.MAX_SAFE_INTEGER

      const bOrder = Number.isFinite(b.sortOrder)
        ? bOrder
        : Number.MAX_SAFE_INTEGER

      return aOrder - bOrder || a.name.localeCompare(b.name, 'ru')
    })
    .map((cabinet) => ({
      ...cabinet,
      zones: getZonesForCabinet(cabinet.id),
    }))
})

const totalPatients = computed(() => {
  return Object.values(patientInputs).reduce((total, value) => {
    return total + (Number(value) || 0)
  }, 0)
})

const totalMoney = computed(() => {
  return cabinetsWithZones.value.reduce((total, cabinet) => {
    const cabinetSum = cabinet.zones.reduce((zoneTotal, zone) => {
      const count = Number(patientInputs[zone.cabinetZoneId]) || 0
      return zoneTotal + count * zone.price
    }, 0)

    return total + cabinetSum
  }, 0)
})

function cabinetPatientsTotal(cabinet) {
  return cabinet.zones.reduce((total, zone) => {
    return total + (Number(patientInputs[zone.cabinetZoneId]) || 0)
  }, 0)
}

function cabinetMoneyTotal(cabinet) {
  return cabinet.zones.reduce((total, zone) => {
    const count = Number(patientInputs[zone.cabinetZoneId]) || 0
    return total + count * zone.price
  }, 0)
}

/* ---------- Загрузка записей на дату ---------- */

async function loadPatientsForDate() {
  if (!selectedDate.value) return

  isLoading.value = true
  savedMessage.value = ''

  try {
    const records = await db.patientCounts
      .where('date')
      .equals(selectedDate.value)
      .toArray()

    savedCounts.value = records

    Object.keys(patientInputs).forEach((key) => {
      delete patientInputs[key]
    })

    cabinetZones.value.forEach((link) => {
      patientInputs[link.id] = 0
    })

    records.forEach((record) => {
      patientInputs[record.cabinetZoneId] = record.count
    })
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

watch(
  selectedDate,
  async () => {
    await Promise.all([loadPatientsForDate(), loadMonthCounts()])
  },
  { immediate: true },
)

watch(
  cabinetZones,
  () => {
    cabinetZones.value.forEach((link) => {
      if (patientInputs[link.id] === undefined) {
        patientInputs[link.id] = 0
      }
    })
  },
  { deep: true },
)

/* ---------- Сохранение пациентов ---------- */

async function savePatients() {
  if (!selectedDate.value) {
    alert('Выберите дату')
    return
  }

  isSaving.value = true
  savedMessage.value = ''

  try {
    await db.transaction('rw', db.patientCounts, async () => {
      for (const link of cabinetZones.value) {
        const count = Math.max(0, Number(patientInputs[link.id]) || 0)

        const existing = await db.patientCounts
          .where('[date+cabinetZoneId]')
          .equals([selectedDate.value, link.id])
          .first()

        if (existing) {
          await db.patientCounts.update(existing.id, {
            count,
            updatedAt: new Date().toISOString(),
          })
        } else {
          await db.patientCounts.add({
            date: selectedDate.value,
            cabinetZoneId: link.id,
            count,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
      }
    })

    savedMessage.value = `Данные за ${selectedDateLabel.value} сохранены`

    savedCounts.value = await db.patientCounts
      .where('date')
      .equals(selectedDate.value)
      .toArray()

    await loadMonthCounts()
  } catch (error) {
    console.error(error)
    alert('Не удалось сохранить данные')
  } finally {
    isSaving.value = false
  }
}

function startDrag(cabinetId) {
  draggedCabinetId.value = cabinetId
}

function endDrag() {
  draggedCabinetId.value = null
  dragOverCabinetId.value = null
}

function dragOverCabinet(cabinetId) {
  if (cabinetId !== draggedCabinetId.value) {
    dragOverCabinetId.value = cabinetId
  }
}

async function dropCabinet(targetCabinetId) {
  const sourceCabinetId = draggedCabinetId.value

  if (!sourceCabinetId || sourceCabinetId === targetCabinetId) {
    endDrag()
    return
  }

  const ordered = [...cabinetsWithZones.value]
  const sourceIndex = ordered.findIndex(
    (cabinet) => cabinet.id === sourceCabinetId,
  )
  const targetIndex = ordered.findIndex(
    (cabinet) => cabinet.id === targetCabinetId,
  )

  if (sourceIndex === -1 || targetIndex === -1) {
    endDrag()
    return
  }

  const [movedCabinet] = ordered.splice(sourceIndex, 1)
  ordered.splice(targetIndex, 0, movedCabinet)

  await db.transaction('rw', db.cabinets, async () => {
    for (let index = 0; index < ordered.length; index++) {
      await db.cabinets.update(ordered[index].id, {
        sortOrder: (index + 1) * 10,
      })
    }
  })

  endDrag()
}

function clearAllInputs() {
  const confirmed = window.confirm(
    'Очистить все значения на экране? Изменения будут применены только после сохранения.',
  )

  if (!confirmed) return

  cabinetZones.value.forEach((link) => {
    patientInputs[link.id] = 0
  })
}
</script>

<template>
  <div class="mx-auto max-w-6xl p-3">
    <!-- Compact header -->
    <header class="sticky top-2 z-20 mb-2 flex flex-wrap items-end justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:bg-gray-900/60">
      <div class="min-w-0">
        <h1 class="text-lg font-bold leading-tight">Пациенты по кабинетам</h1>
        <p class="text-xs text-gray-500">Введите количество пациентов по зонам и сохраните</p>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <UFormField label="Дата" class="!mb-0">
          <UInput v-model="selectedDate" type="date" class="h-8 w-36 text-xs" />
        </UFormField>

        <UButton color="neutral" variant="soft" size="xs" @click="setToday">
          Сегодня
        </UButton>

        <UButton color="neutral" variant="soft" size="xs" @click="clearAllInputs">
          Очистить
        </UButton>

        <UButton :loading="isSaving" size="xs" @click="savePatients">
          Сохранить
        </UButton>
      </div>
    </header>

    <UAlert
      v-if="savedMessage"
      class="mb-2"
      color="success"
      variant="subtle"
      size="sm"
      title="Сохранено"
      :description="savedMessage"
    />

    <!-- Compact stats row -->
    <div class="mb-2 grid grid-cols-3 gap-2">
      <div class="rounded-xl bg-white/70 px-2.5 py-2 text-center shadow-sm backdrop-blur dark:bg-gray-900/60">
        <p class="text-[10px] uppercase tracking-wide text-gray-500">Пациентов</p>
        <p class="mt-0.5 text-lg font-bold">{{ totalPatients }}</p>
      </div>

      <div class="rounded-xl bg-white/70 px-2.5 py-2 text-center shadow-sm backdrop-blur dark:bg-gray-900/60">
        <p class="text-[10px] uppercase tracking-wide text-gray-500">За день</p>
        <div class="mt-0.5 flex items-center justify-center gap-1">
          <p class="text-sm font-bold">
            {{ isMoneyVisible ? formatMoney(totalMoney) : '•••••' }}
          </p>
          <UButton
            :icon="isMoneyVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            size="xs"
            class="h-5 w-5 p-0"
            @click="toggleMoneyVisibility"
          />
        </div>
      </div>

      <div class="rounded-xl bg-white/70 px-2.5 py-2 text-center shadow-sm backdrop-blur dark:bg-gray-900/60">
        <p class="text-[10px] uppercase tracking-wide text-gray-500">За {{ selectedMonthTitle.split(' ')[0] }}</p>
        <div class="mt-0.5 flex items-center justify-center gap-1">
          <p class="text-sm font-bold">
            {{ isMoneyVisible ? formatMoney(monthMoney) : '•••••' }}
          </p>
          <UButton
            :icon="isMoneyVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            size="xs"
            class="h-5 w-5 p-0"
            @click="toggleMoneyVisibility"
          />
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="py-6 text-center text-xs text-gray-500">
      Загрузка…
    </div>

    <div v-else-if="cabinetsWithZones.length" class="space-y-1.5">
      <UCard
        v-for="cabinet in cabinetsWithZones"
        :key="cabinet.id"
        :class="[
          'transition-opacity rounded-xl border-white/60 shadow-none',
          draggedCabinetId === cabinet.id ? 'opacity-40' : '',
          dragOverCabinetId === cabinet.id ? 'ring-2 ring-primary' : '',
        ]"
        @dragover.prevent="dragOverCabinet(cabinet.id)"
        @drop.prevent="dropCabinet(cabinet.id)"
      >
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                draggable="true"
                class="cursor-grab text-gray-400 active:cursor-grabbing"
                aria-label="Перетащить кабинет для сортировки"
                title="Перетащите для изменения порядка"
                @dragstart="startDrag(cabinet.id)"
                @dragend="endDrag"
              >
                <UIcon name="i-lucide-grip-vertical" class="size-4" />
              </button>

              <div class="min-w-0">
                <h2 class="truncate text-sm font-semibold">
                  {{ cabinet.name }}
                </h2>
                <p class="text-[10px] text-gray-500">
                  {{ cabinet.zones.length }} зон • {{ cabinetPatientsTotal(cabinet) }} пациентов •
                  {{ isMoneyVisible ? formatMoney(cabinetMoneyTotal(cabinet)) : '•••••' }}
                </p>
              </div>
            </div>
          </div>
        </template>

        <div
          v-if="cabinet.zones.length"
          class="divide-y divide-gray-100 dark:divide-gray-800"
        >
          <div
            v-for="zone in cabinet.zones"
            :key="zone.cabinetZoneId"
            class="grid grid-cols-[1fr_64px_80px] items-center gap-2 px-2 py-1.5"
          >
            <div class="min-w-0">
              <p class="truncate text-xs font-medium">
                {{ zone.name }}
              </p>
              <p class="text-[10px] text-gray-500">
                {{ formatMoney(zone.price) }} / пациент
              </p>
            </div>

            <UInput
              v-model.number="patientInputs[zone.cabinetZoneId]"
              type="number"
              min="0"
              placeholder="0"
              class="h-7 w-full text-xs"
            />

            <p class="text-right text-xs font-medium">
              {{
                formatMoney(
                  (Number(patientInputs[zone.cabinetZoneId]) || 0) * zone.price,
                )
              }}
            </p>
          </div>
        </div>

        <p v-else class="px-2 py-2 text-xs text-gray-500">
          К этому кабинету не прикреплены зоны.
        </p>
      </UCard>
    </div>

    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      size="sm"
      title="Кабинетов пока нет"
      description="Сначала создайте кабинеты и привяжите к ним зоны на странице /add."
    />

    <div class="mt-2 flex justify-end">
      <UButton :loading="isSaving" size="sm" @click="savePatients">
        Сохранить за {{ selectedDateLabel }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.apple-glass,
.apple-glass-soft {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(12px);
}

.dark .apple-glass,
.dark .apple-glass-soft {
  background: rgba(17, 24, 39, 0.5);
}

.apple-glass-inset {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.06);
}
</style>