(() => {
  const locales = ['en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi'];
  const entries = {
    'Bubble Arena · 크레이지 아케이드 프로토타입': ['Bubble Arena · Crazy Arcade Prototype', 'Bubble Arena · クレイジーアーケード試作版', 'Bubble Arena · 泡泡堂原型', 'Bubble Arena · Prototype Crazy Arcade', 'Bubble Arena · Prototipo Crazy Arcade', 'Bubble Arena · Protótipo Crazy Arcade', 'Bubble Arena · क्रेज़ी आर्केड प्रोटोटाइप'],
    '물풍선 연쇄 폭발, 파워업, 3인 AI 대전을 지원하는 오프라인 웹 아케이드 프로토타입입니다.': ['An offline web arcade prototype featuring water-balloon chain explosions, powerups, and 3 AI opponents.', '水風船の連鎖爆発、パワーアップ、3人のAI対戦に対応したオフラインWebアーケード試作版です。', '支持水泡连锁爆炸、强化道具与3名AI对战的离线网页街机原型。', 'Prototype arcade web hors ligne avec explosions en chaîne de bombes à eau, bonus et 3 adversaires IA.', 'Prototipo arcade web sin conexión con explosiones en cadena, mejoras y 3 rivales de IA.', 'Protótipo arcade web offline com explosões em cadeia, melhorias e 3 oponentes de IA.', 'वॉटर-बैलून चेन विस्फोट, पावर-अप और 3 AI विरोधियों वाला ऑफ़लाइन वेब आर्केड प्रोटोटाइप।'],
    '방향키/WASD 이동, Space 물풍선 설치, R 재시작. 모바일 터치 패드와 폭탄 버튼을 지원합니다.': ['Arrow keys/WASD to move, Space to place water balloon, R to restart. Touch controls supported.', '矢印キー/WASDで移動、Spaceで水風船設置、Rでリスタート。モバイル用タッチパッドと爆弾ボタンに対応しています。', '方向键/WASD 移动，Space 放置水泡，R 重新开始。支持移动端触控方向键与炸弹按钮。', 'Flèches/WASD pour bouger, Espace pour poser une bombe à eau, R pour recommencer. Commandes tactiles incluses.', 'Flechas/WASD para moverte, Espacio para poner globo de agua, R para reiniciar. Compatible con controles táctiles.', 'Setas/WASD para mover, Espaço para soltar balão de água, R para reiniciar. Controles por toque suportados.', 'चलने के लिए एरो/WASD, वॉटर बैलून के लिए Space, रीस्टार्ट के लिए R। टच नियंत्रण समर्थित है।'],
    '파괴 가능한 블록을 부수고 파워업을 모아 상대 AI 3명을 물방울에 가두고 처치하면 승리합니다.': ['Destroy blocks, collect powerups, and trap all 3 AI opponents to win.', '破壊可能なブロックを壊してパワーアップを集め、3人のAI相手を水泡に閉じ込めて倒すと勝利です。', '破坏可摧毁方块并收集道具，将3名AI对手困入水泡并淘汰即可获胜。', 'Détruisez les blocs, ramassez les bonus et piégez les 3 adversaires IA dans des bulles pour gagner.', 'Destruye bloques, recoge mejoras y atrapa a los 3 rivales de IA en burbujas para ganar.', 'Destrua blocos, colete melhorias e prenda os 3 oponentes de IA em bolhas para vencer.', 'ब्लॉक तोड़ें, पावर-अप इकट्ठा करें और जीतने के लिए सभी 3 AI विरोधियों को बबल में फँसाएँ।'],
    '로딩 중': ['Loading', '読み込み中', '加载中', 'Chargement', 'Cargando', 'Carregando', 'लोड हो रहा है'],
    'AI 쉬움': ['AI Easy', 'AI かんたん', 'AI 简单', 'IA Facile', 'IA Fácil', 'IA Fácil', 'AI आसान'],
    'AI 보통': ['AI Normal', 'AI ふつう', 'AI 普通', 'IA Normale', 'IA Normal', 'IA Normal', 'AI सामान्य'],
    'AI 어려움': ['AI Hard', 'AI むずかしい', 'AI 困难', 'IA Difficile', 'IA Difícil', 'IA Difícil', 'AI कठिन'],
    '새 게임': ['New Game', '新しいゲーム', '新游戏', 'Nouvelle partie', 'Nueva partida', 'Novo jogo', 'नया खेल'],
    '물풍선으로 상대를 가두세요!': ['Trap opponents in water balloons!', '水風船で相手を閉じ込めよう！', '用水泡困住对手！', 'Piégez vos adversaires dans des bulles !', '¡Atrapa a tus rivales en burbujas de agua!', 'Prenda os oponentes em balões de água!', 'विरोधियों को वॉटर बैलून में फँसाएँ!'],
    '블록을 부수고 아이템을 모으세요.': ['Break blocks and collect items.', 'ブロックを壊してアイテムを集めよう。', '打破方块并收集道具。', 'Cassez les blocs et collectez des objets.', 'Rompe bloques y recoge objetos.', 'Quebre blocos e colete itens.', 'ब्लॉक तोड़ें और आइटम इकट्ठा करें।'],
    '방향키 / WASD 이동 · 스페이스 물풍선 · R 재시작 · 모바일 터치 지원': ['Arrows / WASD move · Space balloon · R restart · Touch supported', '矢印キー / WASD 移動 · Space 水風船 · R リスタート · タッチ対応', '方向键 / WASD 移动 · 空格 水泡 · R 重开 · 支持触控', 'Flèches / WASD bouger · Espace bombe · R rejouer · Tactile inclus', 'Flechas / WASD mover · Espacio globo · R reiniciar · Táctil', 'Setas / WASD mover · Espaço balão · R reiniciar · Toque', 'एरो / WASD चलें · Space बैलून · R रीस्टार्ट · टच समर्थित'],
    '설치': ['Place', '設置', '放置', 'Poser', 'Poner', 'Colocar', 'रखें'],
    '🏆 승리!': ['🏆 Victory!', '🏆 勝利！', '🏆 胜利！', '🏆 Victoire !', '🏆 ¡Victoria!', '🏆 Vitória!', '🏆 जीत!'],
    '💧 게임 오버': ['💧 Game Over', '💧 ゲームオーバー', '💧 游戏结束', '💧 Fin de partie', '💧 Fin del juego', '💧 Fim de jogo', '💧 गेम ओवर'],
    '다시 도전해 보세요!': ['Try again!', 'もう一度挑戦してみよう！', '再来一局吧！', 'Réessayez !', '¡Inténtalo de nuevo!', 'Tente novamente!', 'फिर से प्रयास करें!'],
    '점수: {0}': ['Score: {0}', 'スコア: {0}', '得分：{0}', 'Score : {0}', 'Puntuación: {0}', 'Pontuação: {0}', 'स्कोर: {0}'],
    '🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4}명 생존': ['🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4} alive', '🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4}人生存', '🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4}人存活', '🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4} en vie', '🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4} vivos', '🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4} vivos', '🏆 {0} 💣 {1} 🌊 {2} 👟 {3} 👥 {4} जीवित']
  };
  const dictionary = {};
  for (const [source, values] of Object.entries(entries)) {
    const row = { ko: source };
    locales.forEach((locale, index) => { if (values[index]) row[locale] = values[index]; });
    dictionary[source] = row;
  }
  if (globalThis.PlayHubLocale) globalThis.PlayHubLocale.register(dictionary);
})();
