// Plays a list of items back to back.
// - Video clips alternate between two <video> elements: while one plays, the
//   other preloads and seeks to the next clip, so signs switch with no gap.
// - Image items (e.g. fingerspelled letters) stay on screen for item.seconds.

const once = (el, ev) =>
  new Promise((resolve, reject) => {
    const ok = () => { el.removeEventListener("error", bad); resolve(); };
    const bad = () => { el.removeEventListener(ev, ok); reject(new Error("clip failed to load")); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });

export class ClipPlayer {
  constructor(videos, img, { onStep, onDone } = {}) {
    this.vids = videos;
    this.img = img;
    this.onStep = onStep;
    this.onDone = onDone;
    this.run = 0;
  }

  async prepVideo(video, item, rate) {
    try {
      video.pause();
      video.src = item.src;
      video.playbackRate = rate;
      await once(video, "loadedmetadata");
      if (item.start > 0) {
        video.currentTime = item.start;
        await once(video, "seeked");
      }
      return true;
    } catch {
      return false;
    }
  }

  async prepImage(item) {
    try {
      const preload = new Image();
      preload.src = item.image;
      await preload.decode();
      return true;
    } catch {
      return false;
    }
  }

  prep(item, slot, rate) {
    return item.image ? this.prepImage(item) : this.prepVideo(this.vids[slot], item, rate);
  }

  playVideo(video, item, run) {
    return new Promise((resolve) => {
      video.play().catch(resolve);
      const tick = () => {
        if (run !== this.run) { video.pause(); return resolve(); }
        const end = item.end ?? video.duration;
        if (video.ended || video.currentTime >= end - 0.04) { video.pause(); return resolve(); }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  hold(ms, run) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => (run !== this.run || performance.now() - t0 >= ms ? resolve() : setTimeout(tick, 30));
      tick();
    });
  }

  show(item, slot) {
    this.vids.forEach((v, i) => v.classList.toggle("on", !item.image && i === slot));
    this.img.classList.toggle("on", Boolean(item.image));
    if (item.image) this.img.src = item.image;
  }

  async play(items, rate = 1) {
    const run = ++this.run;
    if (!items.length) return this.onDone?.();

    let slot = 0; // which <video> the current item uses (ignored for images)
    let ready = await this.prep(items[0], slot, rate);

    for (let i = 0; i < items.length; i++) {
      if (run !== this.run) return;
      const item = items[i];
      // An image doesn't use a video slot, so the next video can reuse this one.
      const nextSlot = item.image ? slot : 1 - slot;
      const nextPrep = i + 1 < items.length ? this.prep(items[i + 1], nextSlot, rate) : Promise.resolve(false);

      if (ready) {
        this.show(item, slot);
        this.onStep?.(item.token, i);
        if (item.image) await this.hold((item.seconds ?? 1.2) * 1000 / rate, run);
        else await this.playVideo(this.vids[slot], item, run);
      }
      ready = await nextPrep;
      slot = nextSlot;
    }
    if (run === this.run) this.onDone?.();
  }

  stop() {
    this.run++;
    this.vids.forEach((v) => v.pause());
  }
}
