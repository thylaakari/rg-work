<!-- app/pages/add.vue -->
<script setup>
useHead({
  title: 'Добавить',
})
import { liveQuery } from 'dexie'

/*
  Реактивная подписка на Dexie.
  При добавлении, изменении или удалении записи интерфейс обновится сам.
*/
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

const openedCabinets = ref([])

function toggleCabinet(cabinetId) {
  if (openedCabinets.value.includes(cabinetId)) {
    openedCabinets.value = openedCabinets.value.filter((id) => id !== cabinetId)
    return
  }

  openedCabinets.value.push(cabinetId)
}

const cabinets = useLiveQuery(() => db.cabinets.orderBy('name').toArray(), [])

const zones = useLiveQuery(() => db.zones.orderBy('name').toArray(), [])

const cabinetZones = useLiveQuery(() => db.cabinetZones.toArray(), [])

/* ---------- Палитра цветов зон ---------- */
const ZONE_COLORS = [
  { label: 'Основной',      value: 'primary' },
  { label: 'Вторичный',     value: 'secondary' },
  { label: 'Успех',         value: 'success' },
  { label: 'Инфо',          value: 'info' },
  { label: 'Внимание',      value: 'warning' },
  { label: 'Ошибка',        value: 'error' },
  { label: 'Нейтральный',   value: 'neutral' },
]

const DEFAULT_ZONE_COLOR = 'neutral'

function zoneColor(zone) {
  return zone?.color || DEFAULT_ZONE_COLOR
}

/* ---------- Формы добавления ---------- */

const zoneForm = reactive({
  name: '',
  price: null,
  color: DEFAULT_ZONE_COLOR, // дефолт для новой зоны
})

/* ---------- Формы редактирования ---------- */

const zoneEditingForm = reactive({
  name: '',
  price: null,
  color: DEFAULT_ZONE_COLOR,
})

/* ---------- Формы добавления ---------- */

const cabinetForm = reactive({
  name: '',
})

const zoneForm = reactive({
  name: '',
  price: null,
})

const bindingForm = reactive({
  cabinetId: null,
  zoneId: null,
})

/* ---------- Формы редактирования ---------- */

const cabinetEditingId = ref(null)
const cabinetEditingName = ref('')

const zoneEditingId = ref(null)

const zoneEditingForm = reactive({
  name: '',
  price: null,
})

/* ---------- Select items для Nuxt UI ---------- */

const cabinetItems = computed(() => {
  return cabinets.value.map((cabinet) => ({
    label: cabinet.name,
    value: cabinet.id,
  }))
})

const zoneItems = computed(() => {
  return zones.value.map((zone) => ({
    label: `${zone.name} — ${formatMoney(zone.price)}`,
    value: zone.id,
  }))
})

/* ---------- Вспомогательные функции ---------- */

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function zonesForCabinet(cabinetId) {
  const zoneIds = cabinetZones.value
    .filter((link) => link.cabinetId === cabinetId)
    .map((link) => link.zoneId)

  return zones.value
    .filter((zone) => zoneIds.includes(zone.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/* ---------- CRUD кабинетов ---------- */

async function createCabinet() {
  const name = cabinetForm.name.trim()

  if (!name) {
    alert('Введите название кабинета')
    return
  }

  const lastCabinet = await db.cabinets.orderBy('sortOrder').last()

  await db.cabinets.add({
    name,
    sortOrder: (lastCabinet?.sortOrder || 0) + 1,
    createdAt: new Date().toISOString(),
  })

  cabinetForm.name = ''
}

function startCabinetEdit(cabinet) {
  cabinetEditingId.value = cabinet.id
  cabinetEditingName.value = cabinet.name
}

function cancelCabinetEdit() {
  cabinetEditingId.value = null
  cabinetEditingName.value = ''
}

async function updateCabinet() {
  const name = cabinetEditingName.value.trim()

  if (!cabinetEditingId.value || !name) {
    alert('Введите название кабинета')
    return
  }

  await db.cabinets.update(cabinetEditingId.value, { name })

  cancelCabinetEdit()
}

async function deleteCabinet(cabinetId) {
  if (!db) return

  const confirmed = window.confirm(
    'Удалить кабинет и все связанные с ним зоны пациентов? Это действие нельзя отменить.'
  )

  if (!confirmed) return

  try {
    await db.transaction(
      'rw',
      db.cabinets,
      db.cabinetZones,
      db.patientCounts,
      async () => {
        const links = await db.cabinetZones
          .where('cabinetId')
          .equals(cabinetId)
          .toArray()

        const cabinetZoneIds = links.map(link => link.id)

        if (cabinetZoneIds.length) {
          await db.patientCounts
            .where('cabinetZoneId')
            .anyOf(cabinetZoneIds)
            .delete()

          await db.cabinetZones.bulkDelete(cabinetZoneIds)
        }

        await db.cabinets.delete(cabinetId)
      }
    )
  } catch (error) {
    console.error(error)
    alert('Не удалось удалить кабинет')
  }
}

/* ---------- CRUD зон ---------- */

async function createZone() {
  const name = zoneForm.name.trim()
  const price = Number(zoneForm.price)

  if (!name) {
    alert('Введите название зоны')
    return
  }

  if (!Number.isFinite(price) || price < 0) {
    alert('Введите корректную цену')
    return
  }

  await db.zones.add({
    name,
    price,
    color: zoneForm.color || DEFAULT_ZONE_COLOR,
    createdAt: new Date().toISOString(),
  })

  zoneForm.name = ''
  zoneForm.price = null
  zoneForm.color = DEFAULT_ZONE_COLOR
}

function startZoneEdit(zone) {
  zoneEditingId.value = zone.id
  zoneEditingForm.name = zone.name
  zoneEditingForm.price = zone.price
  zoneEditingForm.color = zoneColor(zone) // fallback на 'neutral'
}

function cancelZoneEdit() {
  zoneEditingId.value = null
  zoneEditingForm.name = ''
  zoneEditingForm.price = null
}

async function updateZone() {
  const name = zoneEditingForm.name.trim()
  const price = Number(zoneEditingForm.price)

  if (!zoneEditingId.value || !name) {
    alert('Введите название зоны')
    return
  }

  if (!Number.isFinite(price) || price < 0) {
    alert('Введите корректную цену')
    return
  }

  await db.zones.update(zoneEditingId.value, {
  name,
  price,
  color: zoneEditingForm.color || DEFAULT_ZONE_COLOR,
})

  cancelZoneEdit()
}

async function deleteZone(zoneId) {
  if (!db) return

  const confirmed = window.confirm(
    'Удалить зону и всех пациентов, связанных с ней во всех кабинетах? Это действие нельзя отменить.'
  )

  if (!confirmed) return

  try {
    await db.transaction(
      'rw',
      db.zones,
      db.cabinetZones,
      db.patientCounts,
      async () => {
        const links = await db.cabinetZones
          .where('zoneId')
          .equals(zoneId)
          .toArray()

        const cabinetZoneIds = links.map(link => link.id)

        if (cabinetZoneIds.length) {
          await db.patientCounts
            .where('cabinetZoneId')
            .anyOf(cabinetZoneIds)
            .delete()

          await db.cabinetZones.bulkDelete(cabinetZoneIds)
        }

        await db.zones.delete(zoneId)
      }
    )
  } catch (error) {
    console.error(error)
    alert('Не удалось удалить зону')
  }
}

/* ---------- CRUD привязок ---------- */

async function attachZone() {
  const cabinetId = Number(bindingForm.cabinetId)
  const zoneId = Number(bindingForm.zoneId)

  if (!cabinetId || !zoneId) {
    alert('Выберите кабинет и зону')
    return
  }

  const exists = await db.cabinetZones
    .where('[cabinetId+zoneId]')
    .equals([cabinetId, zoneId])
    .first()

  if (exists) {
    alert('Эта зона уже прикреплена к выбранному кабинету')
    return
  }

  await db.cabinetZones.add({
    cabinetId,
    zoneId,
    createdAt: new Date().toISOString(),
  })

  bindingForm.zoneId = null
}

async function detachZone(cabinetId, zoneId) {
  const link = await db.cabinetZones
    .where('[cabinetId+zoneId]')
    .equals([cabinetId, zoneId])
    .first()

  if (!link?.id) return

  const confirmed = window.confirm(
    'Открепить зону от этого кабинета? Сама зона останется в справочнике.',
  )

  if (!confirmed) return

  await db.cabinetZones.delete(link.id)
}
</script>

<template>
    <header class="mb-8">
      <h1 class="text-2xl font-bold">Кабинеты и зоны</h1>
    </header>

    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Создание кабинета -->
      <UCard class="apple-glass-soft rounded-2xl border-white/60 shadow-none">
        <template #header>
          <h2 class="text-lg font-semibold">Новый кабинет</h2>
        </template>

        <div class="space-y-4">
          <UFormField label="Название кабинета" required>
            <UInput
              v-model="cabinetForm.name"
              placeholder="675 каб"
              @keyup.enter="createCabinet"
            />
          </UFormField>

          <UButton block @click="createCabinet"> Добавить кабинет </UButton>
        </div>
      </UCard>

      <!-- Создание зоны -->
      <UCard class="apple-glass-soft rounded-2xl border-white/60 shadow-none">
        <template #header>
          <h2 class="text-lg font-semibold">Новая зона</h2>
        </template>

        <div class="space-y-4">
          <UFormField label="Название зоны" required>
            <UInput v-model="zoneForm.name" placeholder="КТ зона 1" />
          </UFormField>

          <UFormField label="Стоимость, ₽" required>
            <UInput
              v-model.number="zoneForm.price"
              type="number"
              min="0"
              placeholder="100"
              @keyup.enter="createZone"
            />
          </UFormField>
          <UFormField label="Цвет зоны">
  <USelect
    v-model="zoneForm.color"
    :items="ZONE_COLORS"
    class="w-full"
  />
</UFormField>

          <UButton block @click="createZone"> Добавить зону </UButton>
        </div>
      </UCard>

      <!-- Привязка -->
      <UCard class="apple-glass-soft rounded-2xl border-white/60 shadow-none">
        <template #header>
          <h2 class="text-lg font-semibold">Привязать зону</h2>
        </template>

        <div class="space-y-4">
          <UFormField label="Кабинет" required>
            <USelect
              v-model="bindingForm.cabinetId"
              :items="cabinetItems"
              placeholder="Выберите кабинет"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Зона" required>
            <USelect
              v-model="bindingForm.zoneId"
              :items="zoneItems"
              placeholder="Выберите зону"
              class="w-full"
            />
          </UFormField>

          <UButton
            block
            :disabled="!cabinetItems.length || !zoneItems.length"
            @click="attachZone"
          >
            Прикрепить зону
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- Редактирование кабинета -->
    <UCard v-if="cabinetEditingId !== null" class="mt-6 apple-glass-soft rounded-2xl border-white/60 shadow-none">
      <template #header>
        <h2 class="text-lg font-semibold">Редактировать кабинет</h2>
      </template>

      <div class="flex flex-col gap-4 md:flex-row md:items-end">
        <UFormField label="Название кабинета" class="flex-1">
          <UInput v-model="cabinetEditingName" @keyup.enter="updateCabinet" />
        </UFormField>

        <div class="flex gap-2">
          <UButton @click="updateCabinet"> Сохранить </UButton>

          <UButton color="neutral" variant="soft" @click="cancelCabinetEdit">
            Отмена
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Редактирование зоны -->
    <UCard v-if="zoneEditingId !== null" class="mt-6 apple-glass-soft rounded-2xl border-white/60 shadow-none">
      <template #header>
        <h2 class="text-lg font-semibold">Редактировать зону</h2>
      </template>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Название зоны">
          <UInput v-model="zoneEditingForm.name" @keyup.enter="updateZone" />
        </UFormField>

        <UFormField label="Стоимость, ₽">
          <UInput
            v-model.number="zoneEditingForm.price"
            type="number"
            min="0"
            @keyup.enter="updateZone"
          />
        </UFormField>
        <UFormField label="Цвет зоны">
  <USelect
    v-model="zoneEditingForm.color"
    :items="ZONE_COLORS"
    class="w-full"
  />
</UFormField>
      </div>

      <div class="mt-4 flex gap-2">
        <UButton @click="updateZone"> Сохранить </UButton>

        <UButton color="neutral" variant="soft" @click="cancelZoneEdit">
          Отмена
        </UButton>
      </div>
    </UCard>

    <!-- Справочник зон -->
    <section class="mt-8">
      <div class="mb-4 flex items-center gap-3">
        <h2 class="text-xl font-semibold">Справочник зон</h2>

        <UBadge color="neutral" variant="subtle">
          {{ zones.length }}
        </UBadge>
      </div>

      <div v-if="zones.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UCard v-for="zone in zones" :key="zone.id" class="apple-glass-soft rounded-2xl border-white/60 shadow-none">
          <div class="flex items-start justify-between gap-4">
            <div>
              <UBadge :color="zoneColor(zone)" variant="subtle">
  {{ zone.name }}
</UBadge>
<span class="ml-2 text-sm text-gray-500">{{ formatMoney(zone.price) }}</span>

              <p class="mt-1 text-sm text-gray-500">
                {{ formatMoney(zone.price) }}
              </p>
            </div>

            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="soft"
                size="xs"
                @click="startZoneEdit(zone)"
              >
                Изменить
              </UButton>

              <UButton
                color="error"
                variant="soft"
                size="xs"
                @click="deleteZone(zone.id)"
              >
                Удалить
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        title="Зон пока нет"
        description="Создайте первую зону: например, «Рентгенография» со стоимостью 100 ₽."
      />
    </section>

    <!-- Кабинеты с назначенными зонами -->
    <section class="mt-8">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-semibold">Кабинеты</h2>

          <UBadge color="neutral" variant="subtle">
            {{ cabinets.length }}
          </UBadge>
        </div>

        <p class="text-sm text-gray-500">
          Нажмите на кабинет, чтобы увидеть зоны
        </p>
      </div>

      <div
        v-if="cabinets.length"
        class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
      >
        <div
          v-for="cabinet in cabinets"
          :key="cabinet.id"
          class="border-b border-gray-200 last:border-b-0 dark:border-gray-800"
        >
          <!-- Строка кабинета -->
          <div class="flex min-h-14 items-center gap-3 px-4 py-2">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 text-left"
              @click="toggleCabinet(cabinet.id)"
            >
              <UIcon
                :name="
                  openedCabinets.includes(cabinet.id)
                    ? 'i-lucide-chevron-down'
                    : 'i-lucide-chevron-right'
                "
                class="size-4 shrink-0 text-gray-500"
              />

              <span class="truncate font-medium">
                {{ cabinet.name }}
              </span>

              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                class="ml-auto shrink-0"
              >
                {{ zonesForCabinet(cabinet.id).length }} зон
              </UBadge>
            </button>

            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Редактировать кабинет"
              @click="startCabinetEdit(cabinet)"
            />

            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              aria-label="Удалить кабинет"
              @click="deleteCabinet(cabinet.id)"
            />
          </div>

          <!-- Раскрывающийся список зон -->
          <div
            v-if="openedCabinets.includes(cabinet.id)"
            class="border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900/40"
          >
            <div v-if="zonesForCabinet(cabinet.id).length" class="space-y-1">
              <div
                v-for="zone in zonesForCabinet(cabinet.id)"
                :key="zone.id"
                class="flex min-h-10 items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <div class="min-w-0">
                  <span class="font-medium">
                    {{ zone.name }}
                  </span>

                  <span class="ml-2 text-sm text-gray-500">
                    {{ formatMoney(zone.price) }}
                  </span>
                </div>

                <UButton
                  label="Открепить"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="shrink-0"
                  @click="detachZone(cabinet.id, zone.id)"
                />
              </div>
            </div>

            <p v-else class="px-3 py-2 text-sm text-gray-500">
              У этого кабинета пока нет зон.
            </p>
          </div>
        </div>
      </div>

      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        title="Кабинетов пока нет"
        description="Создайте первый кабинет в форме выше."
      />
    </section>
</template>
