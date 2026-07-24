<template>
  <v-container fluid class="noaccess-container fill-height pa-0">
    <!-- Animated background (mirrors LoginPage) -->
    <div class="noaccess-background">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="gradient-orb orb-3"></div>
    </div>

    <!-- No-access card -->
    <v-row class="fill-height" align="center" justify="center">
      <v-col cols="12" sm="10" md="7" lg="5" xl="4">
        <v-card class="noaccess-card pa-8" elevation="24" rounded="xl">
          <!-- Logo section -->
          <div class="text-center mb-6">
            <div class="logo-container mb-4">
              <slot name="logo">
                <img
                  :src="logoSrc"
                  alt="Lakekeeper"
                  class="logo-image-svg"
                  style="max-width: 200px !important; width: 200px !important" />
              </slot>
            </div>
          </div>

          <v-divider class="mb-6"></v-divider>

          <!-- Message -->
          <div class="text-center mb-6">
            <v-icon color="warning" size="56" class="mb-3">mdi-lock-alert-outline</v-icon>
            <div class="text-h5 font-weight-medium mb-2">No Access to This Instance</div>
            <p class="text-body-2 text-medium-emphasis">
              Your account is signed in, but it doesn't have access to this Lakekeeper instance.
              Please contact your administrator to request access, and share the instance address
              below so they can identify it.
            </p>
          </div>

          <!-- Instance URL -->
          <v-text-field
            :model-value="instanceUrl"
            label="Instance address"
            variant="outlined"
            density="comfortable"
            readonly
            hide-details
            class="mb-2">
            <template #append-inner>
              <v-btn
                :icon="copied ? 'mdi-check' : 'mdi-content-copy'"
                :color="copied ? 'success' : undefined"
                variant="text"
                size="small"
                :title="copied ? 'Copied' : 'Copy address'"
                @click="copyInstanceUrl"></v-btn>
            </template>
          </v-text-field>

          <!-- User identifier (helps the admin find the right account) -->
          <p v-if="userIdentifier" class="text-caption text-medium-emphasis text-center mb-6">
            Signed in as
            <strong>{{ userIdentifier }}</strong>
          </p>
          <div v-else class="mb-6"></div>

          <!-- Actions -->
          <v-btn
            block
            class="text-none mb-3"
            color="primary"
            prepend-icon="mdi-refresh"
            size="large"
            variant="tonal"
            @click="recheck">
            <span class="font-weight-medium">Check again</span>
          </v-btn>

          <v-btn
            block
            class="text-none"
            prepend-icon="mdi-logout"
            size="large"
            variant="outlined"
            @click="logout">
            <span class="font-weight-medium">Logout</span>
          </v-btn>

          <!-- Tetris — something to do while waiting for access -->
          <v-divider class="my-6"></v-divider>
          <div class="text-center">
            <div class="text-overline text-medium-emphasis mb-3">
              <v-icon size="small" class="mr-1">mdi-gamepad-variant</v-icon>
              While you wait — Play Tetris
            </div>

            <div class="tetris-wrap">
              <div class="tetris-board" :style="boardStyle">
                <div
                  v-for="(cell, i) in displayCells"
                  :key="i"
                  class="tetris-cell"
                  :class="{ filled: !!cell }"
                  :style="cell ? { backgroundColor: cell } : undefined"></div>
                <div v-if="!started || paused || gameOver" class="tetris-overlay">
                  <div v-if="gameOver" class="text-h6 font-weight-bold mb-1">Game over</div>
                  <div v-else-if="paused" class="text-h6 font-weight-medium mb-1">Paused</div>
                  <v-btn size="small" color="primary" variant="elevated" @click="startGame">
                    {{ gameOver ? 'Play again' : started ? 'Resume' : 'Start' }}
                  </v-btn>
                </div>
              </div>
            </div>

            <div class="text-body-2 text-medium-emphasis mt-3">
              Score
              <strong>{{ score }}</strong>
              · Lines
              <strong>{{ lines }}</strong>
            </div>
            <div
              v-if="started && !gameOver"
              class="d-flex justify-center align-center mt-2"
              style="gap: 8px">
              <v-btn size="small" variant="tonal" @click="startGame">Restart</v-btn>
              <v-btn size="small" variant="text" @click="togglePause">
                {{ paused ? 'Resume' : 'Pause' }}
              </v-btn>
            </div>
            <div class="text-caption text-disabled mt-2">
              ← → move · ↑ rotate · ↓ soft drop · space hard drop
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useVisualStore } from '../stores/visual';
import { useUserStore } from '../stores/user';
import LogoDark from '@/assets/LAKEKEEPER_IMAGE_TEXT.svg';
import LogoLight from '@/assets/LAKEKEEPER_IMAGE_TEXT_WHITE.svg';

const router = useRouter();
const visual = useVisualStore();
const userStore = useUserStore();
const appConfig = inject<any>('appConfig', null);

const props = defineProps({
  logoSrc: {
    type: String,
    default: undefined,
  },
  logoSrcLight: {
    type: String,
    default: undefined,
  },
  logoSrcDark: {
    type: String,
    default: undefined,
  },
});

const logoSrc = computed(() => {
  if (props.logoSrcLight && props.logoSrcDark) {
    return visual.themeLight ? props.logoSrcDark : props.logoSrcLight;
  }
  if (props.logoSrc) {
    return props.logoSrc;
  }
  return visual.themeLight ? LogoDark : LogoLight;
});

// The Lakekeeper server URL identifies the instance for the administrator.
const instanceUrl = computed(() => (appConfig?.icebergCatalogUrl ?? '').replace(/\/+$/, ''));

const userIdentifier = computed(
  () => userStore.user?.email || userStore.user?.preferred_username || '',
);

const copied = ref(false);
async function copyInstanceUrl() {
  try {
    await navigator.clipboard.writeText(instanceUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy instance address:', error);
  }
}

// Re-run the router's server check; if access was granted the guard lets us in.
function recheck() {
  router.replace('/');
}

// Reuse the existing logout flow (clears user + OIDC signout).
function logout() {
  router.push('/logout');
}

/* ---------------------------------------------------------------------------
 * Tetris — a small self-contained game to pass the time while awaiting access.
 * No dependencies; keyboard-driven; colors work in both themes.
 * ------------------------------------------------------------------------- */
const COLS = 10;
const ROWS = 16;
const CELL = 18; // px

type Piece = { cells: number[][]; color: string };

const PIECES: Piece[] = [
  { color: '#37bcd6', cells: [[1, 1, 1, 1]] }, // I
  {
    color: '#f2c14e',
    cells: [
      [1, 1],
      [1, 1],
    ],
  }, // O
  {
    color: '#a06cd5',
    cells: [
      [0, 1, 0],
      [1, 1, 1],
    ],
  }, // T
  {
    color: '#4caf7d',
    cells: [
      [0, 1, 1],
      [1, 1, 0],
    ],
  }, // S
  {
    color: '#e05c5c',
    cells: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  }, // Z
  {
    color: '#4a72d6',
    cells: [
      [1, 0, 0],
      [1, 1, 1],
    ],
  }, // J
  {
    color: '#e8944a',
    cells: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  }, // L
];

type Active = { matrix: number[][]; color: string; row: number; col: number };

const emptyBoard = () => Array.from({ length: ROWS }, () => Array<string>(COLS).fill(''));
const board = ref<string[][]>(emptyBoard());
const active = ref<Active | null>(null);
const score = ref(0);
const lines = ref(0);
const started = ref(false);
const paused = ref(false);
const gameOver = ref(false);

let timer: number | null = null;

const boardStyle = computed(() => ({
  gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
  gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
}));

// Flatten the board with the active piece overlaid for rendering.
const displayCells = computed<string[]>(() => {
  const grid = board.value.map((r) => r.slice());
  const a = active.value;
  if (a) {
    for (let r = 0; r < a.matrix.length; r++) {
      for (let c = 0; c < a.matrix[r].length; c++) {
        if (a.matrix[r][c]) {
          const br = a.row + r;
          const bc = a.col + c;
          if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) grid[br][bc] = a.color;
        }
      }
    }
  }
  return grid.flat();
});

function rotateCW(m: number[][]): number[][] {
  const rows = m.length;
  const cols = m[0].length;
  const res = Array.from({ length: cols }, () => Array<number>(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) res[c][rows - 1 - r] = m[r][c];
  }
  return res;
}

function collides(matrix: number[][], row: number, col: number): boolean {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const br = row + r;
      const bc = col + c;
      if (bc < 0 || bc >= COLS || br >= ROWS) return true;
      if (br >= 0 && board.value[br][bc]) return true;
    }
  }
  return false;
}

function spawn() {
  const p = PIECES[Math.floor(Math.random() * PIECES.length)];
  const matrix = p.cells.map((r) => r.slice());
  const col = Math.floor((COLS - matrix[0].length) / 2);
  const next: Active = { matrix, color: p.color, row: 0, col };
  if (collides(next.matrix, next.row, next.col)) {
    endGame();
    return;
  }
  active.value = next;
}

function lockAndClear() {
  const a = active.value;
  if (!a) return;
  const grid = board.value.map((r) => r.slice());
  for (let r = 0; r < a.matrix.length; r++) {
    for (let c = 0; c < a.matrix[r].length; c++) {
      if (a.matrix[r][c]) {
        const br = a.row + r;
        const bc = a.col + c;
        if (br >= 0) grid[br][bc] = a.color;
      }
    }
  }
  const kept = grid.filter((r) => r.some((cell) => !cell));
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(Array<string>(COLS).fill(''));
  board.value = kept;
  if (cleared > 0) {
    lines.value += cleared;
    score.value += [0, 40, 100, 300, 1200][cleared] ?? cleared * 400;
  }
  spawn();
}

function step() {
  const a = active.value;
  if (!a) return;
  if (collides(a.matrix, a.row + 1, a.col)) {
    lockAndClear();
  } else {
    active.value = { ...a, row: a.row + 1 };
  }
}

function move(dc: number) {
  const a = active.value;
  if (!a || paused.value || gameOver.value) return;
  if (!collides(a.matrix, a.row, a.col + dc)) active.value = { ...a, col: a.col + dc };
}

function rotate() {
  const a = active.value;
  if (!a || paused.value || gameOver.value) return;
  const rotated = rotateCW(a.matrix);
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collides(rotated, a.row, a.col + kick)) {
      active.value = { ...a, matrix: rotated, col: a.col + kick };
      return;
    }
  }
}

function softDrop() {
  if (paused.value || gameOver.value) return;
  step();
}

function hardDrop() {
  const a = active.value;
  if (!a || paused.value || gameOver.value) return;
  let row = a.row;
  while (!collides(a.matrix, row + 1, a.col)) row++;
  active.value = { ...a, row };
  lockAndClear();
}

function tick() {
  if (paused.value || gameOver.value) return;
  step();
}

function startTimer() {
  stopTimer();
  timer = window.setInterval(tick, 550);
}
function stopTimer() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function startGame() {
  // If merely paused, resume rather than restart.
  if (started.value && paused.value && !gameOver.value) {
    paused.value = false;
    startTimer();
    return;
  }
  board.value = emptyBoard();
  score.value = 0;
  lines.value = 0;
  gameOver.value = false;
  paused.value = false;
  started.value = true;
  spawn();
  startTimer();
}

function togglePause() {
  if (!started.value || gameOver.value) return;
  paused.value = !paused.value;
  if (paused.value) stopTimer();
  else startTimer();
}

function endGame() {
  gameOver.value = true;
  stopTimer();
}

function onKeydown(e: KeyboardEvent) {
  if (!started.value || gameOver.value) return;
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'p', 'P'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  switch (e.key) {
    case 'ArrowLeft':
      move(-1);
      break;
    case 'ArrowRight':
      move(1);
      break;
    case 'ArrowUp':
      rotate();
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case ' ':
      hardDrop();
      break;
    case 'p':
    case 'P':
      togglePause();
      break;
  }
}

onMounted(() => {
  visual.showAppOrNavBar = false;
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  visual.showAppOrNavBar = true;
  stopTimer();
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.noaccess-container {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
}

/* Tetris */
.tetris-wrap {
  display: flex;
  justify-content: center;
}

.tetris-board {
  position: relative;
  display: grid;
  gap: 1px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.tetris-cell {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.tetris-cell.filled {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.tetris-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.82);
  backdrop-filter: blur(2px);
}

/* Calm, mostly-neutral backdrop (not the loud login gradient) — this is an
   access-denied page, so keep it subtle: theme background with a faint tint. */
.noaccess-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background:
    linear-gradient(
      135deg,
      rgba(var(--v-theme-primary), 0.1) 0%,
      rgba(var(--v-theme-secondary), 0.1) 100%
    ),
    rgb(var(--v-theme-background));
  z-index: 0;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.12;
  animation: float 20s ease-in-out infinite;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-secondary)) 0%,
    rgb(var(--v-theme-primary)) 100%
  );
  top: -100px;
  left: -100px;
  animation-delay: 0s;
}

.orb-2 {
  width: 350px;
  height: 350px;
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-primary)) 0%,
    rgb(var(--v-theme-primary-darken-1)) 100%
  );
  bottom: -100px;
  right: -100px;
  animation-delay: 5s;
}

.orb-3 {
  width: 300px;
  height: 300px;
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-secondary)) 0%,
    rgb(var(--v-theme-primary)) 100%
  );
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: 10s;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -30px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
}

.noaccess-card {
  position: relative;
  z-index: 1;
  backdrop-filter: blur(20px);
  background: rgba(255, 255, 255, 0.95) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
}

.logo-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.logo-image-svg {
  max-width: 150px;
  width: 150px;
  height: auto;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.15));
}

.v-theme--dark .noaccess-card {
  background: rgba(30, 30, 30, 0.95) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

@media (max-width: 600px) {
  .noaccess-card {
    margin: 16px;
  }

  .orb-1,
  .orb-2,
  .orb-3 {
    width: 250px;
    height: 250px;
  }
}
</style>
