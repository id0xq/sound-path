// Сборка приложения: движок, природа, птицы, атмосфера, ритм, генераторы, дирижёр, голос, запись, живые звуки.
import { Engine } from './engine.js';
import { Nature, Birds } from './nature.js';
import { Tanpura, Binaural, Breath } from './atmos.js';
import { Rhythm } from './rhythm.js';
import { Generators } from './generators.js';
import { Conductor } from './conductor.js';
import { Voice } from './voice.js';
import { Recorder } from './recorder.js';
import { Live } from './live.js';

export class App {
  async init() {
    const E = (this.E = await new Engine().init());
    this.nature = new Nature(E);
    this.birds = new Birds(E);
    this.tanpura = new Tanpura(E);
    this.binaural = new Binaural(E);
    this.conductor = new Conductor(this);
    this.breath = new Breath(E, () => (this.conductor.pad ? [this.conductor.pad.breath.gain] : []));
    this.rhythm = new Rhythm(this);
    this.gen = new Generators(this);
    this.voice = new Voice(E);
    this.recorder = new Recorder(E, this.voice);
    this.live = new Live(this);
    E.setSpaceLevel({ user: 1, scene: 0.55 });

    // Тикер в отдельном потоке: не засыпает в фоновой вкладке
    const src = 'let id=null;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';
    this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    this.worker.onmessage = () => this.tick();
    this.worker.postMessage(50);
    setTimeout(() => E.prewarmSpaces(), 1500);
    return this;
  }
  tick() {
    const E = this.E; if (E.ctx.state !== 'running') return;
    try { this.conductor.tick(E.now, E.now + 0.4); } catch (e) { console.error(e); }
  }
}
