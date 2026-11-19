import { createRouter, createWebHistory } from 'vue-router';
import ViewerPage from '../views/ViewerPage.vue';
import AdminPage from '../views/AdminPage.vue';
import OperationEditorPage from '../views/OperationEditorPage.vue';
import ShareView from '../views/ShareView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'viewer', component: ViewerPage, meta: { title: '查看端' } },
    { path: '/admin', name: 'admin', component: AdminPage, meta: { title: '管理端' } },
    // 单接口管理独立成页：表单重，弹窗装不下；独立 URL 还能直接分享给同事
    {
      path: '/admin/documents/:docId/operations',
      name: 'operation-editor',
      component: OperationEditorPage,
      meta: { title: '接口管理' },
    },
    // 分享页：公开访问，不进任何登录门
    { path: '/s/:token', name: 'share', component: ShareView, meta: { title: '分享文档' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
