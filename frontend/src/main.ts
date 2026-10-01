/**
 * 브라우저 진입점. 공통 스타일과 라우터를 한 Vue 앱에 설치하고 index.html의 #app에 연결한다.
 * 라우트별 화면은 App 내부에서 교체하므로 앱이 제공하는 단일 플레이어의 수명은 유지된다.
 */
import { createApp } from 'vue';
import App from './app/App.vue';
import { router } from './app/router';
import './styles/main.css';

createApp(App).use(router).mount('#app');
