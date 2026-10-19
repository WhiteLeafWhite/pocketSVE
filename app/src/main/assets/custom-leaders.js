// User-added leader. The website's original craft is Portalcraft; this app uses
// Royal/Swordcraft explicitly requested by the user, with their supplied artwork.
(function () {
  const id = 'svgdb-2808';
  const royal = window.POCKET_CATALOG.leaders.find(leader => leader.id === '100002');
  window.POCKET_CATALOG.leaders.push({
    id, name: '洛菈米亚（Ralmia）', aliases: '拉拉米亚 菈菈米亚 ララミア 2808',
    classId: '2', skinId: id, available: true,
    portrait: 'custom/ralmia/profile.png', thumbnail: 'custom/ralmia/profile.png',
    background: 'custom/ralmia/background.jpg', frame: royal.frame,
    backgroundOnly: true,
    // Original image is kept intact. Anchor the face instead of cropping to center.
    backgroundLayout: { width: 1280, height: 2119, faceX: .367, faceY: .172, targetX: .5, targetY: .64, widthScale: 1.6 },
    source: 'https://svgdb.me/leaders/2808', isDark: false,
  });
  const labels = ['打招呼', '感谢', '道歉', '赞叹', '惊讶', '思考', '挑衅'];
  window.POCKET_LINES[id] = { start: '', end: '', emotes: labels.map((label, i) => ({ icon: i + 1, text: '', label })) };
  window.POCKET_AUDIO.leaders[id] = {
    enter: 'audio/ralmia-2808-jp-008.mp3', start: '', end: '', scan: '',
    emotes: Object.fromEntries(labels.map((_, i) => [String(i + 1), `audio/ralmia-2808-jp-00${i + 1}.mp3`])),
  };
})();
