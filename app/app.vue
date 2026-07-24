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
      <NuxtPage />
    </UContainer>
  </UApp>
</template>
