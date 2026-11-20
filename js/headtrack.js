// Поворот головы: звуковая сцена остаётся на месте, когда вы поворачиваетесь —
// ручей слева так и остаётся слева от мира, а не от ушей. Это сильно усиливает погружение.
// Работает сам: на телефоне и планшете включается гироскоп при входе, без кнопок.
// «Вперёд» медленно подстраивается под то, куда вы идёте или смотрите, — как пространственное
// аудио в наушниках, которое следует за устройством. Резкие повороты слышны сразу, а через
// полминуты в новом направлении «вперёд» снова там, куда вы смотрите.
// Данные датчиков наушников (AirPods и другие) браузеры сайтам не передают, поэтому опора — телефон.

export const motionAvailable = () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  && (window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : true);

export class HeadTracker {
  constructor(E, onChange) {
    this.E = E; this.onChange = onChange;
    this.mode = 'off'; this.raw = { yaw: 0, pitch: 0 }; this.ref = { yaw: 0, pitch: 0 }; this.s = { yaw: 0, pitch: 0 };
    this.follow = 22;       // секунд: как быстро «вперёд» догоняет ваше направление
    this.permission = null;
    this.onOri = this.onOri.bind(this);
  }

  // Вызывать прямо в обработчике нажатия: iPhone спрашивает разрешение только в ответ на жест
  requestPermission() {
    if (this.permission) return this.permission;
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      this.permission = DeviceOrientationEvent.requestPermission().then((r) => r === 'granted').catch(() => false);
    } else this.permission = Promise.resolve(typeof DeviceOrientationEvent !== 'undefined');
    return this.permission;
  }

  async startGyro() {
    if (this.mode === 'gyro') return true;
    const ok = await this.requestPermission();
    if (!ok) throw new Error('Доступ к датчикам движения не разрешён.');
    this.mode = 'gyro'; this.first = true; this.lastT = 0;
    window.addEventListener('deviceorientation', this.onOri);
    return true;
  }
  onOri(e) {
    if (e.alpha === null || e.alpha === undefined) return;
    // alpha растёт против часовой стрелки; поворот вправо — отрицательный
    this.update(-e.alpha, 0);
  }

  update(yaw, pitch) {
    const wrap = (a) => ((a + 540) % 360) - 180;
    this.raw = { yaw, pitch };
    const now = performance.now() / 1000, dt = this.lastT ? Math.min(0.5, now - this.lastT) : 0; this.lastT = now;
    if (this.first) { this.ref = { ...this.raw }; this.first = false; }
    // «вперёд» не спеша следует за вами
    if (dt && this.follow) this.ref.yaw = wrap(this.ref.yaw + wrap(yaw - this.ref.yaw) * (1 - Math.exp(-dt / this.follow)));
    const y = wrap(yaw - this.ref.yaw), p = pitch - this.ref.pitch;
    // мягкое сглаживание: без дрожи, но без заметной задержки
    const dy = wrap(y - this.s.yaw);
    this.s.yaw = wrap(this.s.yaw + dy * 0.35);
    this.s.pitch += (p - this.s.pitch) * 0.3;
    this.E.setHead(this.s.yaw, 0);
    this.onChange && this.onChange(this.s);
  }

  recenter() { this.ref = { ...this.raw }; this.s = { yaw: 0, pitch: 0 }; this.E.setHead(0, 0); this.onChange && this.onChange(this.s); }

  stop() {
    window.removeEventListener('deviceorientation', this.onOri);
    this.mode = 'off';
    this.s = { yaw: 0, pitch: 0 }; this.E.setHead(0, 0);
    this.onChange && this.onChange(this.s);
  }
}
