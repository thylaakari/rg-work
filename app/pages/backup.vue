<!-- app/pages/backup.vue -->
<script setup>
useHead({
  title: 'Импорт/экспорт',
})

/*
  ВАЖНО:
  Схема должна совпадать с add.vue, index.vue и statistics.vue.
*/

const isExporting = ref(false)
const isImporting = ref(false)
const message = ref('')
const messageType = ref('success')
const fileInput = ref(null)

const stats = ref({
  cabinets: 0,
  zones: 0,
  cabinetZones: 0,
  patientCounts: 0,
  totalPatients: 0,
})

const totalRecords = computed(() => {
  return (
    stats.value.cabinets +
    stats.value.zones +
    stats.value.cabinetZones +
    stats.value.patientCounts
  )
})

function showMessage(type, text) {
  messageType.value = type
  message.value = text
}

function getBackupFileName() {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')

  return `hospital-backup-${year}-${month}-${day}_${hours}-${minutes}.json`
}

async function loadStats() {
  if (!import.meta.client) return

  const patientRows = await db.patientCounts.toArray()

  stats.value = {
    cabinets: await db.cabinets.count(),
    zones: await db.zones.count(),
    cabinetZones: await db.cabinetZones.count(),
    patientCounts: patientRows.length,
    totalPatients: patientRows.reduce((sum, row) => {
      return sum + (Number(row.count) || 0)
    }, 0),
  }
}

/*
  Экспортируем не только массивы, но и метаданные:
  - версия формата
  - дата создания резервной копии
  - название базы
*/
async function exportBackup() {
  if (!import.meta.client) return

  isExporting.value = true
  message.value = ''

  try {
    const backup = await db.transaction(
      'r',
      db.cabinets,
      db.zones,
      db.cabinetZones,
      db.patientCounts,
      async () => {
        return {
          app: 'HospitalLocalDB',
          formatVersion: 1,
          exportedAt: new Date().toISOString(),
          data: {
            cabinets: await db.cabinets.toArray(),
            zones: await db.zones.toArray(),
            cabinetZones: await db.cabinetZones.toArray(),
            patientCounts: await db.patientCounts.toArray(),
          },
        }
      },
    )

    const json = JSON.stringify(backup, null, 2)

    const blob = new Blob([json], {
      type: 'application/json;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = getBackupFileName()
    link.click()

    URL.revokeObjectURL(url)

    showMessage('success', 'Резервная копия успешно скачана.')
  } catch (error) {
    console.error(error)
    showMessage('error', 'Не удалось создать резервную копию.')
  } finally {
    isExporting.value = false
  }
}

function selectImportFile() {
  fileInput.value?.click()
}

function isValidBackup(backup) {
  if (!backup || typeof backup !== 'object') return false
  if (backup.app !== 'HospitalLocalDB') return false
  if (!backup.data || typeof backup.data !== 'object') return false

  return (
    Array.isArray(backup.data.cabinets) &&
    Array.isArray(backup.data.zones) &&
    Array.isArray(backup.data.cabinetZones) &&
    Array.isArray(backup.data.patientCounts)
  )
}

async function handleImportFile(event) {
  if (!import.meta.client) return

  const file = event.target.files?.[0]

  /*
    Это позволит выбрать тот же файл повторно,
    если пользователь исправит что-то или повторит импорт.
  */
  event.target.value = ''

  if (!file) return

  if (!file.name.toLowerCase().endsWith('.json')) {
    showMessage('error', 'Выберите файл резервной копии в формате JSON.')
    return
  }

  isImporting.value = true
  message.value = ''

  try {
    const text = await file.text()
    const backup = JSON.parse(text)

    if (!isValidBackup(backup)) {
      throw new Error('Неверный формат резервной копии')
    }

    const confirmed = window.confirm(
      `Импортировать файл «${file.name}»?\n\n` +
        `Текущие данные будут полностью удалены и заменены данными из файла.\n\n` +
        `Кабинетов: ${backup.data.cabinets.length}\n` +
        `Зон: ${backup.data.zones.length}\n` +
        `Привязок: ${backup.data.cabinetZones.length}\n` +
        `Записей пациентов: ${backup.data.patientCounts.length}`,
    )

    if (!confirmed) return

    /*
      Полная замена данных выполняется одной транзакцией.
      Сначала очищаем таблицы, после — записываем массивы из backup.
    */
    await db.transaction(
      'rw',
      db.cabinets,
      db.zones,
      db.cabinetZones,
      db.patientCounts,
      async () => {
        await db.patientCounts.clear()
        await db.cabinetZones.clear()
        await db.zones.clear()
        await db.cabinets.clear()

        if (backup.data.cabinets.length) {
          await db.cabinets.bulkPut(backup.data.cabinets)
        }

        if (backup.data.zones.length) {
          await db.zones.bulkPut(backup.data.zones)
        }

        if (backup.data.cabinetZones.length) {
          await db.cabinetZones.bulkPut(backup.data.cabinetZones)
        }

        if (backup.data.patientCounts.length) {
          await db.patientCounts.bulkPut(backup.data.patientCounts)
        }
      },
    )

    await loadStats()

    showMessage(
      'success',
      `Импорт завершён. Восстановлено записей: ${
        backup.data.cabinets.length +
        backup.data.zones.length +
        backup.data.cabinetZones.length +
        backup.data.patientCounts.length
      }.`,
    )
  } catch (error) {
    console.error('IMPORT ERROR:', error)

    if (error instanceof SyntaxError) {
      showMessage('error', 'Файл повреждён: не удалось прочитать JSON.')
    } else {
      showMessage(
        'error',
        `Не удалось импортировать файл: ${error?.message || 'неизвестная ошибка'}`
      )
    }
  } finally {
    isImporting.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>

<template>
    <header class="mb-8">
      <h1 class="text-2xl font-bold">Резервная копия</h1>

      <p class="mt-2 text-sm text-gray-500">
        Экспортируйте данные в JSON-файл или восстановите их из ранее
        сохранённой копии.
      </p>
    </header>

    <UAlert
      v-if="message"
      class="mb-5"
      :color="messageType === 'success' ? 'success' : 'error'"
      variant="subtle"
      :title="messageType === 'success' ? 'Готово' : 'Ошибка'"
      :description="message"
    />

    <UCard class="apple-glass-soft apple-glass-inset mb-5 rounded-3xl overflow-hidden">
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Экспорт базы</h2>

          <p class="mt-1 text-sm text-gray-500">
            Скачает JSON-файл со всеми кабинетами, зонами, привязками и дневными
            записями.
          </p>
        </div>
      </template>

      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="text-sm text-gray-500">
          <p>Кабинетов: {{ stats.cabinets }}</p>
          <p>Зон: {{ stats.zones }}</p>
          <p>Привязок: {{ stats.cabinetZones }}</p>
          <p>Всего пациентов: {{ stats.totalPatients }}</p>
        </div>

        <UButton
          icon="i-lucide-download"
          :loading="isExporting"
          @click="exportBackup"
        >
          Скачать резервную копию
        </UButton>
      </div>
    </UCard>

    <UCard class="apple-glass-soft rounded-2xl border-white/60 shadow-none">
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Импорт базы</h2>

          <p class="mt-1 text-sm text-gray-500">
            Восстановит данные из JSON-копии. Текущая локальная база будет
            полностью заменена.
          </p>
        </div>
      </template>

      <UAlert
        class="mb-4"
        color="warning"
        variant="subtle"
        title="Внимание"
        description="Перед импортом рекомендуется сначала скачать текущую резервную копию."
      />

      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="hidden"
        @change="handleImportFile"
      />

      <UButton
        icon="i-lucide-upload"
        color="warning"
        :loading="isImporting"
        @click="selectImportFile"
      >
        Выбрать JSON-файл и восстановить
      </UButton>
    </UCard>
</template>
