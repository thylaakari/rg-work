<script setup>
const navItems = [
  { label: 'Главная', to: '/' },
  { label: 'Добавить', to: '/add' },
  { label: 'Статистика', to: '/statistics' },
  { label: 'Бэкап', to: '/backup' },
]
</script>

<template>
  <UApp>
    <UContainer>
      <UNavigationMenu :items="navItems" class="w-full justify-center" />
      <UContainer class="max-w-6xl py-6">
  <div class="apple-glass rounded-3xl p-4 md:p-6">
    
      <NuxtPage />
  </div>
</UContainer>
    </UContainer>
  </UApp>
</template>
