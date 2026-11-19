import { createRouter, createWebHistory } from 'vue-router';
import ViewerPage from '../views/ViewerPage.vue';
import AdminPage from '../views/AdminPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'viewer', component: ViewerPage, meta: { title: '查看端' } },
    { path: '/admin', name: 'admin', component: AdminPage, meta: { title: '管理端' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
