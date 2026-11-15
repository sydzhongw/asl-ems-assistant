import sys
p = sys.argv[1] if len(sys.argv) > 1 else "app/demo.html"
s = open(p, encoding="utf-8").read()
if "syncSpeech" in s:
print("already patched"); sys.exit(0)
if "eMuteBtn" not in s:
print("Apply the mute/video/end buttons patch first."); sys.exit(1)
def rep(a, b):
global s
if s.count(a) != 1:
print("COULD NOT PATCH, this text wasn't found exactly once:\n", a[:90]); sys.exit(1)
s = s.replace(a, b)
rep(" .heard { margin-top: 18px;", """ .listen { font-size: 12px; color: #86efac; margin-bottom: 6px; }
.listen.off { color: #fbbf24; }
.heard { margin-top: 18px;""")
rep('<div class="heard"><span class="label">You said</span>',
'<div class="heard"><div id="listen" class="listen">● Listening: your words are being transcribed</div><span class="label">You said</span>')
rep("let muted = false, videoOff = false, sr,", "let emsMuted = false, muted = false, videoOff = false, sr,")
rep("function toggleEmsMic() {", """function setListening(state) {
const l = $("listen");
l.className = "listen" + (state === true ? "" : " off");
l.textContent = state === true ? "● Listening: your words are being transcribed"
: state === false ? "Mic muted: nothing is being transcribed"
: "Speech recognition unavailable: type below";
}
function syncSpeech(muting) {
emsMuted = muting;
if (!sr) return;
if (muting) { srWanted = false; try { sr.stop(); } catch (e) {} $("interim").textContent = ""; setListening(false); }
else { srWanted = true; try { sr.start(); } catch (e) {} setListening(true); }
}
function toggleEmsMic() {""")
rep('setCtl("eMuteBtn", on, on ? "🔇" : "🎙", on ? "Unmute" : "Mute");',
'setCtl("eMuteBtn", on, on ? "🔇" : "🎙", on ? "Unmute" : "Mute"); syncSpeech(on);')
rep("sr.onresult = e => {\n let interim = \"\";", "sr.onresult = e => {\n if (emsMuted) return;\n let interim = \"\";")
rep('$("srBtn").hidden = true; return; }', 'setListening(null); return; }')
rep('$("heard").textContent = "Speech recognition is blocked. Type below instead."; }', '$("heard").textContent = "Speech recognition is blocked. Type below instead."; setListening(null); }')
rep(" srWanted = true; try { sr.start(); } catch (e) {}\n}", " srWanted = true; try { sr.start(); } catch (e) {}\n setListening(true);\n}")
rep(""" `<button class="b" id="srBtn" onclick="toggleSpeech()">Speech: on</button>`;""", '"";')
rep("""function toggleSpeech() {
if (!sr) return;
srWanted = !srWanted; $("srBtn").textContent = "Speech: " + (srWanted ? "on" : "off");
if (srWanted) { try { sr.start(); } catch (e) {} } else sr.stop();
}
""", "")
rep('$("heard").textContent = "Speak, and the signer will sign it."; $("interim").textContent = "";',
'$("heard").textContent = "Speak, and the signer will sign it."; $("interim").textContent = ""; emsMuted = false; setListening(true);')
open(p, "w", encoding="utf-8").write(s)
print("patched", p)
