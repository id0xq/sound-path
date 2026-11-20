// Сборка приложения: движок, ханг Handpan Sphere, природа, птицы, атмосфера, ритм, генераторы,
// дирижёр, голос проводника, голос ведущего, повороты головы, запись, живые звуки.
import { Engine } from './engine.js';
import { Nature, Birds } from './nature.js';
import { Tanpura, Binaural, Breath } from './atmos.js';
import { Rhythm } from './rhythm.js';
import { Generators } from './generators.js';
import { Conductor } from './conductor.js';
import { Voice } from './voice.js';
import { Recorder } from './recorder.js';
import { Live } from './live.js';
import { HandpanSamples } from './samples.js';
import { Narrator } from './narrator.js';
import { HeadTracker } from './headtrack.js';
import { SampleLib } from './sampler.js';
import { Groove } from './groove.js';
import { Improv } from './improv.js';
import { Fauna } from './fauna.js';
import { Field } from './field.js';

export class App {
  async init(onProgress) {
    const E = (this.E = await new Engine().init());
    this.hp = E.hp = new HandpanSamples(E);
    const loading = this.hp.load(onProgress);
    this.nature = new Nature(E);
    this.birds = new Birds(E);
    this.tanpura = new Tanpura(E);
    this.binaural = new Binaural(E);
    this.conductor = new Conductor(this);
    this.breath = new Breath(E, () => (this.conductor.pad ? [this.conductor.pad.breath.gain] : []));
    this.rhythm = new Rhythm(this);
    this.lib = new SampleLib(E);
    this.groove = new Groove(this);
    this.improv = new Improv(this);
    this.fauna = new Fauna(this);
    this.field = new Field(this); this.birds.field = this.field;
    this.gen = new Generators(this);
    this.voice = new Voice(E);
    this.narrator = new Narrator(this);
    this.recorder = new Recorder(E, this.voice);
    this.live = new Live(this);
    this.head = new HeadTracker(E, (s) => this.onHead && this.onHead(s));
    E.setSpaceLevel({ user: 1, scene: 0.55 });
    await Promise.race([loading, new Promise((r) => setTimeout(r, 6000))]);
    await this.narrator.init();
    this.lib.loadAll();   // киты, пэды, бас и флейта — в фоне, меньше мегабайта
    await Promise.race([this.field.init(), new Promise((r) => setTimeout(r, 2500))]);   // карта живых записей (сами записи грузятся по мере надобности)

    // Ведущий читает реплику, когда сюжет до неё доходит
    this.conductor.on('line', ({ idx, speak }) => {
      if (speak && this.narrator.on && this.conductor.running) this.narrator.speak(this.conductor.lines[idx], this.conductor.set.id);
    });
    this.conductor.on('end', () => this.narrator.stop());

    // Тикер в отдельном потоке: не засыпает в фоновой вкладке
    const src = 'let id=null;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';
    this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    this.worker.onmessage = () => this.tick();
    this.worker.postMessage(40);
    return this;
  }
  // общий такт для мелодий: грув, если звучит, иначе медитативный ритм
  get clock() { return this.groove.active ? this.groove : this.rhythm; }
  tick() {
    const E = this.E; if (E.ctx.state !== 'running') return;
    const now = E.now;
    try {
      this.conductor.tick(now, now + 0.4);
      if (this.breathwork) this.breathwork.tick(now, now + 0.4);
      if (this.conductor.pad) this.conductor.pad.animate(now);
      E.motion(now);
    } catch (e) { console.error(e); }
  }
}
