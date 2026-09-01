<!-- app/pages/index.vue -->
<script setup>


useHead({
  title: 'Главная',
})
import  { liveQuery } from 'dexie'


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


/*
  Значения, которые пользователь сейчас видит и редактирует.


  Формат:
  {
    15: 34,
    16: 5
  }


  где ключ — cabinetZoneId,
  значение — число пациентов.
*/
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
        ? b.sortOrder
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


    /*
      Очищаем поля, иначе при переключении даты могли бы
      остаться числа от предыдущего дня.
    */
    Object.keys(patientInputs).forEach((key) => {
      delete patientInputs[key]
    })


    /*
      Заполняем все существующие привязки нулём.
      В шаблоне input сразу будет показывать 0.
    */
    cabinetZones.value.forEach((link) => {
      patientInputs[link.id] = 0
    })


    /*
      Подставляем сохранённые значения за выбранную дату.
    */
    records.forEach((record) => {
      patientInputs[record.cabinetZoneId] = record.count
    })
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}


/*
  При смене даты загружаются именно данные этой даты.
*/
watch(
  selectedDate,
  async () => {
    await Promise.all([loadPatientsForDate(), loadMonthCounts()])
  },
  { immediate: true },
)


/*
  Если на странице добавили новую привязку кабинет-зона,
  она должна сразу появиться среди полей ввода с нулём.
*/
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


        /*
          Находим запись за эту дату и эту привязку.
          Если есть — обновляем.
          Если нет — создаём.
        */
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


    /*
      Обновляем локальный снимок уже сохранённых значений.
    */
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


  /*
    Сохраняем новый порядок.
    Числа 10, 20, 30 ... оставляют место для будущих вставок.
  */
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
    <header
      class="apple-glass sticky top-4 z-20 mb-6 rounded-3xl px-4 py-4 md:px-6"
    >
      <div>
        <h1 class="text-2xl font-bold">Пациенты по кабинетам</h1>


        <p class="mt-1 text-sm text-gray-500">
          Введите количество пациентов по каждой зоне и сохраните данные за
          выбранную дату.
        </p>
      </div>


      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="Дата">
          <UInput v-model="selectedDate" type="date" class="w-44" />
        </UFormField>


        <UButton color="neutral" variant="soft" @click="setToday">
          Сегодня
        </UButton>


        <UButton color="neutral" variant="soft" @click="clearAllInputs">
          Очистить
        </UButton>


        <UButton :loading="isSaving" @click="savePatients"> Сохранить </UButton>
      </div>
    </header>


    <UAlert
      v-if="savedMessage"
      class="mb-4"
      color="success"
      variant="subtle"
      title="Сохранено"
      :description="savedMessage"
    />


    <div class="mb-5 grid gap-3 sm:grid-cols-3">
      <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
        <p class="text-sm text-gray-500">Пациентов за выбранный день</p>


        <p class="mt-1 text-2xl font-bold">
          {{ totalPatients }}
        </p>
      </UCard>


      <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
        <p class="text-sm text-gray-500">Сумма за выбранный день</p>


        <div class="mt-1 flex items-center gap-2">
          <p class="text-2xl font-bold">
            {{ isMoneyVisible ? formatMoney(totalMoney) : '••••••' }}
          </p>


          <UButton
            :icon="isMoneyVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="isMoneyVisible ? 'Скрыть суммы' : 'Показать суммы'"
            @click="toggleMoneyVisibility"
          />
        </div>
      </UCard>


      <UCard class="apple-glass-soft apple-glass-inset rounded-3xl overflow-hidden">
        <p class="text-sm text-gray-500">Сумма за {{ selectedMonthTitle }}</p>


        <div class="mt-1 flex items-center gap-2">
          <p class="text-2xl font-bold">
            {{ isMoneyVisible ? formatMoney(monthMoney) : '••••••' }}
          </p>


          <UButton
            :icon="isMoneyVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="isMoneyVisible ? 'Скрыть суммы' : 'Показать суммы'"
            @click="toggleMoneyVisibility"
          />
        </div>
      </UCard>
    </div>


    <div v-if="isLoading" class="py-10 text-center text-sm text-gray-500">
      Загружаю данные…
    </div>


    <div v-else-if="cabinetsWithZones.length" class="space-y-3">
      <UCard
        v-for="cabinet in cabinetsWithZones"
        :key="cabinet.id"
        :class="[
          'transition-opacity apple-glass-soft rounded-2xl border-white/60 shadow-none',
          draggedCabinetId === cabinet.id ? 'opacity-40' : '',
          dragOverCabinetId === cabinet.id ? 'ring-2 ring-primary' : '',
        ]"
        @dragover.prevent="dragOverCabinet(cabinet.id)"
        @drop.prevent="dropCabinet(cabinet.id)"
      >
        <template #header>
          <div
            class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
          >
            <div class="flex min-w-0 items-center gap-2">
              <button
                type="button"
                draggable="true"
                class="cursor-grab touch-none text-gray-400 active:cursor-grabbing"
                aria-label="Перетащить кабинет для сортировки"
                title="Перетащите для изменения порядка"
                @dragstart="startDrag(cabinet.id)"
                @dragend="endDrag"
              >
                <UIcon name="i-lucide-grip-vertical" class="size-5" />
              </button>


              <div class="min-w-0">
                <h2 class="truncate font-semibold">
                  {{ cabinet.name }}
                </h2>


                <p class="text-xs text-gray-500">
                  Перетащите за значок слева для изменения порядка
                </p>
              </div>


              <UBadge color="neutral" variant="subtle" size="sm">
                {{ cabinet.zones.length }} зон
              </UBadge>
            </div>


            <div class="flex shrink-0 gap-4 text-sm text-gray-500">
              <span>{{ cabinetPatientsTotal(cabinet) }} пациентов</span>


              <span>
                {{
                  isMoneyVisible
                    ? formatMoney(cabinetMoneyTotal(cabinet))
                    : '••••••'
                }}
              </span>
            </div>
          </div>
        </template>


        <div
          v-if="cabinet.zones.length"
          class="divide-y divide-gray-200 dark:divide-gray-800"
        >
          <div
            v-for="zone in cabinet.zones"
            :key="zone.cabinetZoneId"
            class="grid grid-cols-[minmax(0,1fr)_96px_110px] items-center gap-3 px-4 py-2"
          >
            <div class="min-w-0">
              <p class="truncate font-medium">
                {{ zone.name }}
              </p>


              <p class="text-sm text-gray-500">
                {{ formatMoney(zone.price) }} за пациента
              </p>
            </div>


            <UInput
              v-model.number="patientInputs[zone.cabinetZoneId]"
              type="number"
              min="0"
              placeholder="0"
              class="w-full"
            />


            <p class="text-right text-sm font-medium">
              {{
                formatMoney(
                  (Number(patientInputs[zone.cabinetZoneId]) || 0) * zone.price,
                )
              }}
            </p>
          </div>
        </div>


        <p v-else class="px-4 py-3 text-sm text-gray-500">
          К этому кабинету не прикреплены зоны. Добавьте их на странице
          «Кабинеты и зоны».
        </p>
      </UCard>
    </div>


    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      title="Кабинетов пока нет"
      description="Сначала создайте кабинеты и привяжите к ним зоны на странице /add."
    />


    <div class="mt-4 flex justify-end">
      <UButton :loading="isSaving" size="lg" @click="savePatients">
        Сохранить данные за {{ selectedDateLabel }}
      </UButton>
    </div>
</template>