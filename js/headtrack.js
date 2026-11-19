// Повороты головы: звуковая сцена остаётся на месте, когда вы поворачиваетесь —
// ручей слева так и остаётся слева от мира, а не от ушей. Это сильно усиливает погружение.
//  • Камера: лицо отслеживается прямо в браузере (MediaPipe), видео никуда не отправляется.
//  • Телефон: гироскоп — поворачиваетесь вместе с телефоном, сцена стоит на месте.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class HeadTracker {
  constructor(E, onChange) {
    this.E = E; this.onChange = onChange;
    this.mode = 'off'; this.raw = { yaw: 0, pitch: 0 }; this.ref = { yaw: 0, pitch: 0 }; this.s = { yaw: 0, pitch: 0 };
    this.onOri = this.onOri.bind(this);
  }

  async startCamera(video) {
    this.stop();
    const { FaceLandmarker, FilesetResolver } = await import(/* webpackIgnore: true */ `${MP}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
    this.lm = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      outputFacialTransformationMatrixes: true, runningMode: 'VIDEO', numFaces: 1,
    });
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
    video.srcObject = this.stream; video.muted = true; video.playsInline = true; await video.play();
    this.video = video; this.mode = 'camera'; this.first = true;
    let lastT = -1;
    const loop = () => {
      if (this.mode !== 'camera') return;
      if (video.currentTime !== lastT && video.readyState >= 2) {
        lastT = video.currentTime;
        const r = this.lm.detectForVideo(video, performance.now());
        const m = r.facialTransformationMatrixes && r.facialTransformationMatrixes[0] && r.facialTransformationMatrixes[0].data;
        if (m) {
          // m — матрица 4×4 по столбцам; третий столбец — направление взгляда лица в пространстве камеры.
          // Камера видит человека зеркально: поворот головы вправо уводит нос в левую часть кадра.
          const yaw = (-Math.atan2(m[8], m[10]) * 180) / Math.PI;
          const pitch = (Math.asin(Math.max(-1, Math.min(1, m[9]))) * 180) / Math.PI;
          this.update(yaw, pitch);
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  async startGyro() {
    this.stop();
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('На этом устройстве нет датчиков поворота.');
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('Доступ к датчикам движения не разрешён.');
    }
    this.mode = 'gyro'; this.first = true;
    window.addEventListener('deviceorientation', this.onOri);
  }
  onOri(e) {
    if (e.alpha === null) return;
    // alpha растёт против часовой стрелки; поворот вправо — отрицательный
    this.update(-e.alpha, 0);
  }

  update(yaw, pitch) {
    this.raw = { yaw, pitch };
    if (this.first) { this.ref = { ...this.raw }; this.first = false; }
    let y = yaw - this.ref.yaw; y = ((y + 540) % 360) - 180;
    const p = pitch - this.ref.pitch;
    // мягкое сглаживание: без дрожи, но без заметной задержки
    let dy = y - this.s.yaw; dy = ((dy + 540) % 360) - 180;
    this.s.yaw = ((this.s.yaw + dy * 0.35 + 540) % 360) - 180;
    this.s.pitch += (p - this.s.pitch) * 0.3;
    this.E.setHead(this.s.yaw, this.mode === 'gyro' ? 0 : this.s.pitch);
    this.onChange && this.onChange(this.s);
  }

  recenter() { this.ref = { ...this.raw }; this.s = { yaw: 0, pitch: 0 }; this.E.setHead(0, 0); this.onChange && this.onChange(this.s); }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.video) this.video.srcObject = null;
    window.removeEventListener('deviceorientation', this.onOri);
    this.stream = null; this.mode = 'off';
    this.s = { yaw: 0, pitch: 0 }; this.E.setHead(0, 0);
    this.onChange && this.onChange(this.s);
  }
}
