<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { MemberSummary, MembershipTier } from '../../../../shared/contracts';
import { session, refreshSession } from './session';
import { requestJson, errorMessage } from '../../api/client';
import { useAudioPlayer } from '../../audio/context';
const router = useRouter();
const player = useAudioPlayer();
const mode = ref<'login' | 'register'>('login');
const name = ref('');
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');
const members = ref<MemberSummary[]>([]);
async function load() {
  try {
    await refreshSession();
    if (session.setupRequired) mode.value = 'register';
    if (session.member?.tier === 'admin')
      members.value = ((await requestJson('/members')) as { items: MemberSummary[] }).items;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await requestJson(`/members/${mode.value}`, {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
        ...(mode.value === 'register' ? { name: name.value } : {}),
      },
    });
    password.value = '';
    player.clear();
    await refreshSession();
    await router.push('/projects');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function logout() {
  busy.value = true;
  error.value = '';
  try {
    await requestJson('/members/logout', { method: 'POST', body: {} });
    player.clear();
    members.value = [];
    await refreshSession();
    notice.value = '로그아웃했어요.';
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function changeTier(member: MemberSummary, event: Event) {
  const tier = (event.target as HTMLSelectElement).value as MembershipTier;
  busy.value = true;
  error.value = '';
  try {
    await requestJson(`/members/${member.id}`, { method: 'PATCH', body: { tier } });
    await load();
    notice.value = '회원 등급을 저장했어요.';
  } catch (e) {
    error.value = errorMessage(e);
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="account-page">
    <p class="eyebrow accent-text">YOUR SOUNDRY</p>
    <h1>
      {{
        session.member
          ? '내 계정'
          : mode === 'register'
            ? '나만의 스튜디오 시작하기'
            : '다시, 당신의 사운드로'
      }}
    </h1>
    <p class="page-description">이 컴퓨터에 저장되는 로컬 회원 계정입니다.</p>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>
    <template v-if="session.member">
      <div class="panel account-card">
        <span class="outline-tag">{{ session.member.tier.toUpperCase() }}</span>
        <h2>{{ session.member.name }}</h2>
        <p>{{ session.member.email }}</p>
        <div v-if="session.usage" class="usage-meter">
          <strong>{{ session.usage.used }} / {{ session.usage.limit ?? '무제한' }}곡</strong>
          <p>{{ session.usage.month }} · 생성 중인 곡 포함 · 실패/취소는 복원</p>
          <progress
            v-if="session.usage.limit"
            :value="session.usage.used"
            :max="session.usage.limit"
          ></progress>
        </div>
        <div class="inline-actions">
          <RouterLink to="/projects" class="button button-primary">스튜디오 열기</RouterLink
          ><RouterLink to="/pricing" class="button button-secondary">등급 살펴보기</RouterLink
          ><button class="button button-secondary" :disabled="busy" @click="logout">로그아웃</button>
        </div>
      </div>
      <section v-if="session.member.tier === 'admin'" class="panel account-card">
        <h2>회원 관리</h2>
        <p>결제 없이 수동으로 등급을 지정합니다. 마지막 관리자는 유지됩니다.</p>
        <div v-for="member in members" :key="member.id" class="member-row">
          <div>
            <strong>{{ member.name }}</strong>
            <p>{{ member.email }}</p>
          </div>
          <select
            :aria-label="`${member.name} 회원 등급`"
            :value="member.tier"
            :disabled="busy"
            @change="changeTier(member, $event)"
          >
            <option value="free">Free · 10곡/월</option>
            <option value="plus">Plus · 100곡/월</option>
            <option value="pro">Pro · 500곡/월</option>
            <option value="admin">관리자 · 무제한</option>
          </select>
        </div>
      </section>
    </template>
    <form v-else class="panel account-card account-form" @submit.prevent="submit">
      <p v-if="session.setupRequired" class="notice-banner">
        첫 가입자는 관리자가 되며, 기존 프로젝트를 이어받습니다.
      </p>
      <label v-if="mode === 'register'"
        >이름<input v-model="name" required maxlength="80" autocomplete="name"
      /></label>
      <label
        >이메일<input v-model="email" type="email" required maxlength="254" autocomplete="username"
      /></label>
      <label
        >비밀번호<input
          v-model="password"
          type="password"
          required
          minlength="10"
          maxlength="128"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          placeholder="10자 이상"
      /></label>
      <button class="button button-primary" :disabled="busy">
        {{ busy ? '처리 중…' : mode === 'register' ? '회원가입' : '로그인' }}
      </button>
      <button
        type="button"
        class="text-link"
        :disabled="busy"
        @click="
          mode = mode === 'login' ? 'register' : 'login';
          error = '';
        "
      >
        {{ mode === 'login' ? '처음이신가요? 회원가입' : '이미 계정이 있나요? 로그인' }}
      </button>
    </form>
  </section>
</template>
