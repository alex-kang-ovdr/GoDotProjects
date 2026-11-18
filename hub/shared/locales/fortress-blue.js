(() => {
  // Korean display strings are the keys. A two-column row uses the same name in all seven other locales.
  const locales = ['en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi'];
  const text = `
언어|Language|言語|语言|Langue|Idioma|Idioma|भाषा
포격 전술|Artillery tactics|砲撃戦術|炮击战术|Tactique d’artillerie|Táctica de artillería|Tática de artilharia|तोपखाना रणनीति
ARTILLERY TACTICS|Artillery tactics|砲撃戦術|炮击战术|Tactique d’artillerie|Táctica de artillería|Tática de artilharia|तोपखाना रणनीति
BROWSER EDITION · 1.4|Browser edition · 1.4|ブラウザー版 · 1.4|浏览器版 · 1.4|Édition navigateur · 1.4|Edición web · 1.4|Edição web · 1.4|ब्राउज़र संस्करण · 1.4
출격 준비 열기|Open battle setup|出撃準備を開く|打开出战准备|Ouvrir la préparation|Abrir preparación|Abrir preparação|युद्ध तैयारी खोलें
출격 준비 닫기|Close battle setup|出撃準備を閉じる|关闭出战准备|Fermer la préparation|Cerrar preparación|Fechar preparação|युद्ध तैयारी बंद करें
출격 준비|Battle setup|出撃準備|出战准备|Préparation|Preparación|Preparação|युद्ध तैयारी
조작법|Controls|操作方法|操作说明|Commandes|Controles|Controles|नियंत्रण
조작법 닫기|Close controls|操作方法を閉じる|关闭操作说明|Fermer les commandes|Cerrar controles|Fechar controles|नियंत्रण बंद करें
효과음|Sound effects|効果音|音效|Effets sonores|Efectos de sonido|Efeitos sonoros|ध्वनि प्रभाव
효과음 켜기|Enable sound effects|効果音をオン|开启音效|Activer les effets|Activar sonido|Ativar som|ध्वनि चालू करें
효과음 끄기|Mute sound effects|効果音をオフ|关闭音效|Couper les effets|Silenciar sonido|Silenciar som|ध्वनि बंद करें
전체 화면|Fullscreen|全画面|全屏|Plein écran|Pantalla completa|Tela cheia|पूर्ण स्क्रीन
일시 정지|Pause|一時停止|暂停|Pause|Pausa|Pausa|रोकें
전투 현황|Battle status|戦況|战况|État du combat|Estado del combate|Estado da batalha|युद्ध की स्थिति
전투 조작|Battle controls|戦闘操作|战斗操作|Commandes du combat|Controles de combate|Controles de batalha|युद्ध नियंत्रण
BLUE SQUAD|Blue team|青チーム|蓝队|Équipe bleue|Equipo azul|Equipe azul|नीली टीम
RED SQUAD|Red team|赤チーム|红队|Équipe rouge|Equipo rojo|Equipe vermelha|लाल टीम
BLUE|Blue|青|蓝队|Bleu|Azul|Azul|नीली
RED|Red|赤|红队|Rouge|Rojo|Vermelha|लाल
블루|Blue|青|蓝队|Bleu|Azul|Azul|नीली
레드|Red|赤|红队|Rouge|Rojo|Vermelha|लाल
블루 팀 상태|Blue team status|青チームの状態|蓝队状态|État de l’équipe bleue|Estado del equipo azul|Estado da equipe azul|नीली टीम की स्थिति
레드 팀 상태|Red team status|赤チームの状態|红队状态|État de l’équipe rouge|Estado del equipo rojo|Estado da equipe vermelha|लाल टीम की स्थिति
CLASSIC|Classic|クラシック|经典|Classique|Clásico|Clássico|क्लासिक
ROUND {0}|Round {0}|第{0}ラウンド|第 {0} 回合|Manche {0}|Ronda {0}|Rodada {0}|राउंड {0}
SUDDEN {0}|Sudden death {0}|延長戦 {0}|决胜回合 {0}|Mort subite {0}|Muerte súbita {0}|Morte súbita {0}|निर्णायक राउंड {0}
WIND|Wind|風|风向|Vent|Viento|Vento|हवा
포트리스 전투 지형. 드래그하여 조준할 수 있습니다.|Battlefield. Drag to aim.|戦場。ドラッグで照準を合わせます。|战场。拖动以瞄准。|Champ de bataille. Faites glisser pour viser.|Campo de batalla. Arrastra para apuntar.|Campo de batalha. Arraste para mirar.|युद्धभूमि। निशाना लगाने के लिए खींचें।
SECTOR|Sector|区域|区域|Secteur|Sector|Setor|क्षेत्र
전장 축소|Zoom out|縮小|缩小|Dézoomer|Alejar|Afastar|दूर करें
전장 확대|Zoom in|拡大|放大|Zoomer|Acercar|Aproximar|पास करें
전장 전체 보기|Fit battlefield|戦場全体を表示|适配战场|Afficher tout le terrain|Mostrar todo el campo|Exibir todo o campo|पूरा मैदान दिखाएँ
전체|Fit|全体|全景|Tout|Todo|Tudo|पूरा
서든데스|Sudden death|延長戦|决胜回合|Mort subite|Muerte súbita|Morte súbita|निर्णायक दौर
출격 대기|Ready|出撃待機|等待出战|Prêt|Listo|Pronto|तैयार
← → 이동|← → Move|← → 移動|← → 移动|← → Bouger|← → Mover|← → Mover|← → चलें
↑ ↓ 조준|↑ ↓ Aim|↑ ↓ 照準|↑ ↓ 瞄准|↑ ↓ Viser|↑ ↓ Apuntar|↑ ↓ Mirar|↑ ↓ निशाना
Space 길게 눌러 발사|Hold Space to fire|Space長押しで発射|长按空格发射|Maintenir Espace pour tirer|Mantén Espacio para disparar|Segure Espaço para disparar|चलाने के लिए Space दबाएँ
스킬 선택|Choose weapon|武器選択|选择武器|Choisir une arme|Elegir arma|Escolher arma|हथियार चुनें
아이템|Items|アイテム|道具|Objets|Objetos|Itens|वस्तुएँ
현재 상태 효과|Status effects|状態効果|状态效果|Effets d’état|Efectos de estado|Efeitos de estado|स्थिति प्रभाव
직전 조준 복원|Recall last aim|前回の照準を復元|恢复上次瞄准|Rétablir la visée|Restaurar puntería|Restaurar mira|पिछला निशाना लौटाएँ
이동|Move|移動|移动|Déplacement|Movimiento|Movimento|चलें
왼쪽 이동|Move left|左に移動|向左移动|Aller à gauche|Mover a la izquierda|Mover à esquerda|बाएँ चलें
오른쪽 이동|Move right|右に移動|向右移动|Aller à droite|Mover a la derecha|Mover à direita|दाएँ चलें
조준 각도|Aim angle|照準角|瞄准角度|Angle de visée|Ángulo de mira|Ângulo de mira|निशाने का कोण
발사 방향 전환|Reverse aim direction|射撃方向を反転|切换射击方向|Inverser le tir|Invertir dirección|Inverter direção|गोली की दिशा बदलें
차체 기준 조준 각도|Angle relative to hull|車体基準の照準角|相对车体的瞄准角|Angle par rapport au châssis|Ángulo respecto al chasis|Ângulo relativo ao chassi|वाहन के सापेक्ष कोण
조준 가이드 전환|Toggle aim guide|照準ガイドを切替|切换瞄准辅助|Basculer le guide|Alternar guía|Alternar guia|निशाना गाइड बदलें
범위|Range|範囲|范围|Plage|Rango|Faixa|सीमा
지형|Terrain|地形|地形|Terrain|Terreno|Terreno|भूभाग
실제 고각|Elevation|実仰角|实际仰角|Élévation|Elevación|Elevação|वास्तविक ऊँचाई कोण
발사 파워|Shot power|射撃パワー|射击力度|Puissance|Potencia|Potência|गोली की शक्ति
목표 {0}%|Target {0}%|目標 {0}%|目标 {0}%|Cible {0}%|Objetivo {0}%|Alvo {0}%|लक्ष्य {0}%
직전 {0}%|Last {0}%|前回 {0}%|上次 {0}%|Dernier {0}%|Último {0}%|Último {0}%|पिछला {0}%
▼ 목표|▼ Target|▼ 目標|▼ 目标|▼ Cible|▼ Objetivo|▼ Alvo|▼ लक्ष्य
▲ 직전|▲ Last|▲ 前回|▲ 上次|▲ Dernier|▲ Último|▲ Último|▲ पिछला
발사|Fire|発射|发射|Tirer|Disparar|Disparar|गोली चलाएँ
사용|Use|使用|使用|Utiliser|Usar|Usar|इस्तेमाल
SPACE 길게|Hold Space|Space長押し|长按空格|Maintenir Espace|Mantén Espacio|Segure Espaço|Space दबाएँ
SPACE 즉시|Press Space|Spaceを押す|按空格|Appuyer sur Espace|Pulsa Espacio|Pressione Espaço|Space दबाएँ
턴 넘기기|Pass turn|ターン終了|结束回合|Passer le tour|Pasar turno|Passar a vez|बारी छोड़ें
NEXT|Next|次の順番|下一位|Suivant|Siguiente|Próximo|अगला
새 전투|New battle|新しい戦闘|新战斗|Nouveau combat|Nuevo combate|Nova batalha|नई लड़ाई
데이터 · 설정|Data and settings|データと設定|数据与设置|Données et réglages|Datos y ajustes|Dados e configurações|डेटा और सेटिंग्स
오프라인 다운로드|Offline download|オフライン版を入手|离线下载|Télécharger hors ligne|Descarga sin conexión|Baixar versão offline|ऑफ़लाइन डाउनलोड
각도를 읽고.|Read the angle.|角度を読み、|看准角度。|Lisez l’angle.|Lee el ángulo.|Leia o ângulo.|कोण समझें।
전장을 바꾸다|Change the battlefield|戦場を変えよう|改变战场|Changez le terrain|Cambia el campo|Mude o campo|युद्धभूमि बदलें
바람을 계산한 한 발로,|A shot shaped by the wind|風を計算した一撃が、|算准风向的一击，|Un tir porté par le vent|Un tiro que aprovecha el viento|Um tiro que aproveita o vento|हवा का सही अंदाज़ लेकर एक गोली
승부의 지형을 뒤집으세요.|can turn the battle.|戦況をひっくり返す。|就能扭转战局。|peut renverser le combat.|puede cambiar el combate.|pode virar a batalha.|युद्ध का रुख बदल सकती है।
지형 파괴|Terrain destroyed|地形破壊|地形破坏|Terrain détruit|Terreno destruido|Terreno destruído|भूभाग नष्ट
AI 전술 대전|AI battles|AI対戦|AI 对战|Combat contre l’IA|Combate contra IA|Batalha contra IA|एआई मुकाबला
같은 기기 2인|Local 2-player|同じ端末で2人|同设备双人|Deux joueurs en local|Dos jugadores en local|Dois jogadores no mesmo aparelho|एक ही डिवाइस पर दो खिलाड़ी
캐릭터와 전장을 고르고|Pick a character and a map|キャラクターと戦場を選び、|选择角色和战场，|Choisissez un personnage et un terrain|Elige personaje y mapa|Escolha um personagem e um mapa|पात्र और मैदान चुनें
첫 포격을 준비하세요.|to prepare your first shot.|最初の一撃に備えましょう。|准备第一发炮击。|pour préparer votre premier tir.|para preparar tu primer tiro.|para preparar seu primeiro tiro.|और पहली गोली तैयार करें।
전장|Battlefield|戦場|战场|Terrain|Campo|Campo|युद्धभूमि
전장 선택|Choose battlefield|戦場選択|选择战场|Choisir le terrain|Elegir campo|Escolher campo|मैदान चुनें
대전 방식|Match type|対戦形式|对战方式|Type de combat|Tipo de combate|Tipo de partida|मुकाबले का प्रकार
AI와 대전|Play against AI|AIと対戦|与 AI 对战|Jouer contre l’IA|Jugar contra IA|Jogar contra IA|एआई से खेलें
팀 구성|Team size|チーム人数|队伍人数|Taille des équipes|Tamaño del equipo|Tamanho da equipe|टीम का आकार
{0} 대 {1}|{0} vs {1}|{0} 対 {1}|{0} 对 {1}|{0} contre {1}|{0} contra {1}|{0} contra {1}|{0} बनाम {1}
AI 난이도|AI difficulty|AIの難易度|AI 难度|Difficulté de l’IA|Dificultad de IA|Dificuldade da IA|एआई कठिनाई
입문|Easy|かんたん|简单|Facile|Fácil|Fácil|आसान
보통|Normal|ふつう|普通|Normal|Normal|Normal|सामान्य
도전|Hard|むずかしい|困难|Difficile|Difícil|Difícil|कठिन
상대 선봉|Opponent leader|相手の先鋒|对方先锋|Chef adverse|Líder rival|Líder rival|विरोधी कप्तान
자동 편성|Automatic|自動編成|自动编队|Automatique|Automático|Automático|स्वचालित
조준 시간|Aim time|照準時間|瞄准时间|Temps de visée|Tiempo para apuntar|Tempo de mira|निशाना लगाने का समय
{0}초|{0}s|{0}秒|{0} 秒|{0} s|{0} s|{0} s|{0} सेकंड
15초 · 빠르게|15s · Quick|15秒 · 短い|15 秒 · 快速|15 s · Rapide|15 s · Rápido|15 s · Rápido|15 सेकंड · तेज़
25초 · 기본|25s · Standard|25秒 · 標準|25 秒 · 标准|25 s · Standard|25 s · Estándar|25 s · Padrão|25 सेकंड · मानक
40초 · 여유롭게|40s · Relaxed|40秒 · ゆっくり|40 秒 · 从容|40 s · Détendu|40 s · Relajado|40 s · Relaxado|40 सेकंड · आराम से
60초 · 충분하게|60s · Extra time|60秒 · 長い|60 秒 · 充裕|60 s · Long|60 s · Amplio|60 s · Longo|60 सेकंड · अधिक समय
발사각 자료|Angle reference|射撃角の資料|射角资料|Référence d’angle|Referencia angular|Referência de ângulo|कोण संदर्भ
클래식 발사각 자료|Classic angle reference|クラシックの射撃角資料|经典模式射角资料|Référence classique|Referencia clásica|Referência clássica|क्लासिक कोण संदर्भ
선봉 캐릭터|Lead character|先鋒キャラクター|先锋角色|Personnage de tête|Personaje líder|Personagem líder|अग्रणी पात्र
{0} TYPES|{0} types|{0}種類|{0} 种|{0} types|{0} tipos|{0} tipos|{0} प्रकार
ANGLE|Angle|角度|角度|Angle|Ángulo|Ângulo|कोण
DELAY|Delay|遅延|延迟|Délai|Retraso|Atraso|विलंब
전투 시작|Start battle|戦闘開始|开始战斗|Lancer le combat|Iniciar combate|Iniciar batalha|युद्ध शुरू करें
설치 없이 바로 플레이 · 키보드 & 터치 지원|Play in your browser with keyboard or touch|インストール不要。キーボードとタッチに対応|无需安装，支持键盘和触屏|Jouez dans le navigateur au clavier ou au toucher|Juega en el navegador con teclado o pantalla táctil|Jogue no navegador com teclado ou toque|ब्राउज़र में कीबोर्ड या टच से खेलें
TAKE A BREATH|Paused|休憩|暂停|En pause|En pausa|Em pausa|रुका हुआ
전투 일시 정지|Battle paused|戦闘を一時停止|战斗已暂停|Combat en pause|Combate en pausa|Batalha pausada|युद्ध रुका है
다음 한 발을 생각할 시간.|Plan your next shot.|次の一撃を考えよう。|想一想下一发怎么打。|Préparez votre prochain tir.|Planea tu próximo tiro.|Planeje seu próximo tiro.|अगली गोली की योजना बनाएँ।
전투 계속|Resume battle|戦闘を再開|继续战斗|Reprendre|Continuar combate|Retomar batalha|युद्ध जारी रखें
같은 설정으로 재시작|Restart with same settings|同じ設定で再開|用相同设置重开|Rejouer avec les mêmes réglages|Reiniciar con los mismos ajustes|Reiniciar com as mesmas opções|इन्हीं सेटिंग्स से फिर शुरू करें
출격 준비로 돌아가기|Back to battle setup|出撃準備に戻る|返回出战准备|Retour à la préparation|Volver a preparación|Voltar à preparação|युद्ध तैयारी पर लौटें
VICTORY|Victory|勝利|胜利|Victoire|Victoria|Vitória|जीत
DEFEAT|Defeat|敗北|失败|Défaite|Derrota|Derrota|हार
DRAW|Draw|引き分け|平局|Match nul|Empate|Empate|बराबरी
BLUE WINS|Blue wins|青の勝利|蓝队胜利|Les Bleus gagnent|Gana el azul|Azul venceu|नीली टीम जीती
RED WINS|Red wins|赤の勝利|红队胜利|Les Rouges gagnent|Gana el rojo|Vermelha venceu|लाल टीम जीती
전장의 마지막 한 발을 가져왔습니다.|Your team fired the decisive shot.|最後の一撃で勝利しました。|你的队伍打出了决定性的一击。|Votre équipe a réussi le tir décisif.|Tu equipo hizo el disparo decisivo.|Sua equipe deu o tiro decisivo.|आपकी टीम ने निर्णायक गोली चलाई।
가한 피해|Damage dealt|与えたダメージ|造成伤害|Dégâts infligés|Daño causado|Dano causado|पहुँचाई गई क्षति
발사 탄 수|Shots fired|発射数|发射数|Tirs effectués|Disparos|Disparos|चलाई गई गोलियाँ
진행 턴|Turns played|経過ターン数|经过回合|Tours joués|Turnos jugados|Turnos jogados|खेली गई बारियाँ
다시 대전 ↗|Rematch ↗|再戦 ↗|再战 ↗|Revanche ↗|Revancha ↗|Revanche ↗|फिर खेलें ↗
다른 캐릭터로 출격|Pick another character|別のキャラクターで出撃|更换角色出战|Changer de personnage|Elegir otro personaje|Escolher outro personagem|दूसरा पात्र चुनें
FIELD MANUAL|Field manual|戦場マニュアル|战场手册|Manuel de terrain|Manual de campo|Manual de campo|युद्ध पुस्तिका
한 발을 위한 준비|Prepare your shot|一撃の準備|准备射击|Préparer son tir|Prepara tu tiro|Prepare seu tiro|गोली की तैयारी
01 · 위치를 잡으세요|01 · Get into position|01 · 位置につく|01 · 选择位置|01 · Prenez position|01 · Toma posición|01 · Tome posição|01 · जगह चुनें
02 · 바람과 각도|02 · Wind and angle|02 · 風と角度|02 · 风向与角度|02 · Vent et angle|02 · Viento y ángulo|02 · Vento e ângulo|02 · हवा और कोण
03 · 파워를 결정하세요|03 · Set your power|03 · パワーを決める|03 · 设定力度|03 · Réglez la puissance|03 · Elige la potencia|03 · Escolha a potência|03 · शक्ति तय करें
04 · 한 발 이상의 전략|04 · More than one shot|04 · 射撃以外の戦術|04 · 射击之外的战术|04 · Au-delà du tir|04 · Más que disparar|04 · Além do disparo|04 · गोली से आगे की रणनीति
← → 또는 이동 버튼으로 이동합니다. 이동 게이지는 턴마다 회복됩니다. 지면이 사라지면 아래로 떨어집니다.|Move with ← → or the movement buttons. Movement refills each turn. You fall if the ground gives way.|← →か移動ボタンで移動。移動ゲージは毎ターン回復し、足場が崩れると落下します。|用 ← → 或移动按钮移动。移动槽每回合恢复，地面被破坏时会坠落。|Déplacez-vous avec ← → ou les boutons. La jauge se remplit à chaque tour. Si le sol cède, vous tombez.|Muévete con ← → o los botones. El movimiento se recarga cada turno. Si el suelo cede, caerás.|Mova-se com ← → ou os botões. O movimento recarrega a cada turno. Você cai se o solo ceder.|← → या बटन से चलें। गति हर बारी में भरती है। ज़मीन टूटने पर आप गिरेंगे।
↑ ↓ 또는 각도 슬라이더로 조준합니다. 범위는 차체 기준이며 실제 고각은 지형 기울기를 반영합니다. 전장을 드래그해 조준하고 ⇄ 버튼으로 방향을 바꾸세요.|Aim with ↑ ↓, the angle slider or a drag on the field. Slopes change actual elevation. Press ⇄ to turn.|↑ ↓、角度スライダー、戦場のドラッグで照準。傾斜で実仰角が変わり、⇄で方向を切り替えます。|用 ↑ ↓、角度滑块或拖动战场瞄准。坡度影响实际仰角，⇄ 可切换方向。|Visez avec ↑ ↓, le curseur ou en glissant. La pente change l’élévation. ⇄ inverse la direction.|Apunta con ↑ ↓, el deslizador o arrastrando. La pendiente cambia la elevación. Usa ⇄ para girar.|Mire com ↑ ↓, o controle deslizante ou arrastando. A inclinação muda a elevação. Use ⇄ para virar.|↑ ↓, कोण स्लाइडर या खींचकर निशाना लगाएँ। ढलान वास्तविक ऊँचाई बदलती है। ⇄ से मुड़ें।
슬라이더로 목표 파워를 정합니다. ▼는 목표, ▲는 직전 발사 파워입니다. Space나 발사 버튼을 길게 눌러 충전하고 원하는 값에서 놓으세요.|Set target power with the slider. ▼ marks your target and ▲ the last shot. Hold Space or Fire to charge and release to fire.|スライダーで目標パワーを設定。▼は目標、▲は前回。Spaceか発射ボタンを長押しし、離して撃ちます。|用滑块设置目标力度。▼ 为目标，▲ 为上次力度。长按空格或发射按钮蓄力，松开发射。|Réglez la puissance. ▼ indique la cible, ▲ le tir précédent. Maintenez Espace ou Tirer pour charger, puis relâchez.|Ajusta la potencia. ▼ marca el objetivo y ▲ el tiro anterior. Carga manteniendo Espacio o Disparar y suelta para tirar.|Ajuste a potência. ▼ marca o alvo e ▲ o último tiro. Segure Espaço ou Disparar para carregar e solte para atirar.|शक्ति चुनें। ▼ लक्ष्य है और ▲ पिछला शॉट। Space या फ़ायर दबाकर शक्ति भरें और छोड़कर चलाएँ।
1~4 또는 Q/E로 무기를 고릅니다. 회복·방어·더블·이동탄은 한 턴에 하나씩 사용합니다. 직전 조준 복원으로 이전 각도와 파워를 다시 불러올 수 있습니다.|Select weapons with 1–4 or Q/E. Use one item per turn. Recall your last aim to restore angle and power.|1～4かQ/Eで武器を選択。アイテムは各ターン1つ。前回の照準で角度とパワーを復元できます。|用 1–4 或 Q/E 选择武器，每回合可用一个道具。可恢复上次的角度与力度。|Choisissez l’arme avec 1–4 ou Q/E. Un objet par tour. Rappelez la visée pour retrouver l’angle et la puissance.|Elige arma con 1–4 o Q/E. Usa un objeto por turno. Restaura la mira para recuperar ángulo y potencia.|Escolha armas com 1–4 ou Q/E. Use um item por turno. Restaure a mira para recuperar ângulo e potência.|1–4 या Q/E से हथियार चुनें। हर बारी में एक वस्तु। पिछला निशाना लौटाकर कोण और शक्ति पाएँ।
각도|Angle|角度|角度|Angle|Ángulo|Ângulo|कोण
충전·발사|Charge/fire|ためて発射|蓄力发射|Charger/tirer|Cargar/disparar|Carregar/disparar|भरें/चलाएँ
무기 순환|Cycle weapons|武器切替|切换武器|Changer d’arme|Cambiar arma|Trocar arma|हथियार बदलें
전장으로|Back to battle|戦闘に戻る|返回战斗|Retour au combat|Volver al combate|Voltar à batalha|युद्ध पर लौटें
TACTICAL LAB|Tactical lab|戦術ラボ|战术实验室|Laboratoire tactique|Laboratorio táctico|Laboratório tático|रणनीति प्रयोगशाला
설정 닫기|Close settings|設定を閉じる|关闭设置|Fermer les réglages|Cerrar ajustes|Fechar configurações|सेटिंग्स बंद करें
플레이 설정|Game settings|ゲーム設定|游戏设置|Paramètres de jeu|Ajustes de juego|Configurações do jogo|खेल की सेटिंग्स
데이터 근거|Data sources|データの出典|数据来源|Sources des données|Fuentes de datos|Fontes dos dados|डेटा स्रोत
전투 기록|Match history|戦闘履歴|战斗记录|Historique des combats|Historial de combates|Histórico de batalhas|युद्ध का इतिहास
조준 가이드|Aim guide|照準ガイド|瞄准辅助|Guide de visée|Guía de puntería|Guia de mira|निशाना गाइड
예상 궤적을 점선으로 표시|Show the predicted path as dots|予測弾道を点線で表示|用虚线显示预计弹道|Afficher la trajectoire en pointillé|Mostrar trayectoria en puntos|Mostrar trajetória pontilhada|अनुमानित राह बिंदुओं में दिखाएँ
화면 흔들림 줄이기|Reduce screen shake|画面の揺れを減らす|减少画面震动|Réduire le tremblement|Reducir vibración de pantalla|Reduzir tremor da tela|स्क्रीन का हिलना घटाएँ
폭발 카메라 움직임을 억제|Reduce camera motion from explosions|爆発時のカメラの揺れを抑える|减少爆炸引起的镜头移动|Limiter les mouvements dus aux explosions|Limita el movimiento por explosiones|Reduzir movimento causado por explosões|विस्फोटों से कैमरे की हलचल घटाएँ
효과 품질|Effects quality|エフェクト品質|特效质量|Qualité des effets|Calidad de efectos|Qualidade dos efeitos|प्रभाव की गुणवत्ता
저사양에서는 입자를 줄입니다|Reduce particles for slower devices|低性能の端末では粒子を減らす|低性能设备可减少粒子|Réduire les particules sur les appareils lents|Reduce partículas en equipos lentos|Reduzir partículas em aparelhos lentos|धीमे उपकरणों के लिए कण घटाएँ
높음|High|高|高|Élevée|Alta|Alta|उच्च
낮음|Low|低|低|Faible|Baja|Baixa|कम
다음 새 전투부터 적용 · 한국 참고값은 빌드 미확인|Applies from next battle · Korean build unknown|次の戦闘から適用 · 韓国版ビルド不明|下场战斗生效 · 韩版构建未知|Au prochain combat · version coréenne inconnue|Desde el próximo combate · versión coreana sin confirmar|Na próxima batalha · versão coreana desconhecida|अगले युद्ध से लागू · कोरियाई बिल्ड अज्ञात
다음 전투의 발사각 자료|Next battle’s angle reference|次の戦闘の射撃角資料|下场战斗射角资料|Référence du prochain combat|Referencia del próximo combate|Referência da próxima batalha|अगले युद्ध का कोण संदर्भ
전투 튜닝|Battle tuning|戦闘調整|战斗调校|Réglages du combat|Ajuste de combate|Ajuste de batalha|युद्ध समायोजन
원문에서 확인되지 않은 물리·피해 계수입니다. 수정값은 다음 전투부터 적용됩니다.|Physics and damage settings are approximations. Changes apply to the next battle.|物理とダメージは実装上の近似値。変更は次の戦闘で有効になります。|物理与伤害参数为近似值，修改下场战斗生效。|Coefficients de physique et de dégâts approximatifs. Changements au prochain combat.|Valores de física y daño aproximados. Los cambios se aplican al próximo combate.|Física e dano aproximados. As alterações valem na próxima batalha.|भौतिकी और क्षति के मान अनुमानित हैं। बदलाव अगले युद्ध में लागू होंगे।
기본 구현값 복원|Restore defaults|初期値に戻す|恢复默认值|Rétablir les valeurs par défaut|Restaurar valores|Restaurar valores padrão|मूल मान लौटाएँ
공개 수치와 구현값을 구분합니다.|Published values and simulation settings are listed separately.|公開値と実装値は分けて表示します。|公开数值与模拟参数分开列出。|Les valeurs publiées et les réglages sont séparés.|Los valores publicados y los de simulación aparecen por separado.|Valores publicados e de simulação aparecem separados.|प्रकाशित मान और सिमुलेशन सेटिंग्स अलग हैं।
원작 서버나 실행 파일을 그대로 재현한 버전은 아닙니다. 전투에 연결한 출처와 조정 가능한 모델을 아래에서 확인하세요.|See the sources and simulation settings used for this battle below.|戦闘に使用した出典と調整可能なモデルを下に示します。|下方可查看战斗所用资料与可调参数。|Consultez les sources et les réglages du modèle ci-dessous.|Consulta las fuentes y los parámetros de simulación abajo.|Veja abaixo as fontes e os ajustes da simulação.|नीचे इस युद्ध के स्रोत और सिमुलेशन सेटिंग्स देखें।
이 기기의 브라우저에 최근 12경기만 저장됩니다.|This browser keeps the last 12 matches.|このブラウザーには直近12試合を保存します。|本浏览器仅保存最近 12 场对战。|Ce navigateur conserve les 12 derniers combats.|Este navegador conserva las 12 partidas más recientes.|Este navegador guarda as últimas 12 partidas.|यह ब्राउज़र पिछली 12 लड़ाइयाँ रखता है।
기록 지우기|Clear history|履歴を消去|清空记录|Effacer l’historique|Borrar historial|Limpar histórico|इतिहास मिटाएँ
전투를 불러오지 못했습니다.|Couldn’t load the battle.|戦闘を読み込めませんでした。|无法加载战斗。|Impossible de charger le combat.|No se pudo cargar el combate.|Não foi possível carregar a batalha.|युद्ध लोड नहीं हो पाया।
페이지를 새로 고친 뒤 다시 시도해 주세요.|Reload the page and try again.|ページを再読み込みしてお試しください。|请刷新页面后重试。|Rechargez la page et réessayez.|Recarga la página e inténtalo de nuevo.|Recarregue a página e tente novamente.|पृष्ठ फिर लोड करके कोशिश करें।
새로 고침|Reload|再読み込み|刷新|Recharger|Recargar|Recarregar|फिर लोड करें
`;

  const battle = `
13종 · 두 가지 무기|13 tanks · two weapons|13種 · 武器2つ|13 种坦克 · 两种武器|13 chars · deux armes|13 tanques · dos armas|13 tanques · duas armas|13 टैंक · दो हथियार
4종 · 네 가지 스킬|4 tanks · four skills|4種 · スキル4つ|4 种坦克 · 四种技能|4 chars · quatre compétences|4 tanques · cuatro habilidades|4 tanques · quatro habilidades|4 टैंक · चार कौशल
고원 능선|Highland Ridge|高原の尾根|高原山脊|Crête des hauts plateaux|Cresta de la meseta|Crista do planalto|ऊँचे मैदान की धार
바람의 능선|Windward Ridge|風の尾根|迎风山脊|Crête du vent|Cresta del viento|Crista do vento|हवा की धार
부유 군도|Floating Isles|浮遊諸島|浮空群岛|Îles flottantes|Islas flotantes|Ilhas flutuantes|तैरते द्वीप
황혼의 주조소|Twilight Foundry|黄昏の鋳造所|暮光铸造厂|Fonderie du crépuscule|Fundición del ocaso|Fundição do crepúsculo|साँझ की ढलाईशाला
넓은 사격각과 화염으로 전선을 장악합니다.|Wide firing angles and flames control the front.|広い射角と炎で戦線を制圧します。|用宽射角和火焰控制战线。|De grands angles et des flammes pour tenir le front.|Controla el frente con ángulos amplios y fuego.|Controle a frente com ângulos amplos e chamas.|चौड़े कोण और आग से मोर्चा सँभालें।
독으로 상대의 다음 턴까지 압박합니다.|Poison pressures the enemy into their next turn.|毒で相手の次のターンまで圧力をかけます。|用毒素压制敌人的下一回合。|Le poison menace l’ennemi jusqu’à son prochain tour.|El veneno presiona al rival hasta su próximo turno.|O veneno pressiona o inimigo no próximo turno.|ज़हर दुश्मन की अगली बारी तक असर करता है।
묵직한 포탄으로 지면을 파고듭니다.|Heavy shells carve through terrain.|重い砲弾で地面を掘り崩します。|用重炮弹打穿地面。|Ses obus lourds creusent le terrain.|Sus proyectiles pesados excavan el terreno.|Projéteis pesados escavam o terreno.|भारी गोले ज़मीन तोड़ते हैं।
삼연발과 기동력으로 기회를 만듭니다.|Mobility and triple shots open opportunities.|機動力と三連射で好機を作ります。|用机动性和三连发创造机会。|Mobilité et tirs triples créent des ouvertures.|Movilidad y disparos triples abren oportunidades.|Mobilidade e tiros triplos criam oportunidades.|तेज़ चाल और तीन गोलियाँ मौका बनाती हैं।
두 가지 포탄으로 지형과 거리를 공략합니다.|Use two shell types to exploit range and terrain.|二種類の砲弾で距離と地形を攻略します。|用两种炮弹应对距离和地形。|Deux types d’obus pour exploiter distance et terrain.|Dos tipos de proyectil para aprovechar distancia y terreno.|Dois tipos de projétil para explorar distância e terreno.|दूरी और भूभाग के लिए दो तरह के गोले हैं।
지뢰를 깔아 상대의 이동을 제한합니다.|Place mines to limit enemy movement.|地雷で相手の移動を制限します。|布置地雷限制敌人移动。|Posez des mines pour freiner l’ennemi.|Coloca minas para limitar al rival.|Instale minas para limitar o inimigo.|बारूदी सुरंगें दुश्मन की चाल रोकती हैं।
유도 미사일로 상대의 위치를 추적합니다.|Homing missiles track enemy positions.|誘導ミサイルで相手を追尾します。|用制导导弹追踪敌人。|Les missiles guidés suivent l’ennemi.|Los misiles guiados siguen al rival.|Mísseis guiados perseguem o inimigo.|निर्देशित मिसाइलें दुश्मन का पीछा करती हैं।
연속 포격으로 넓은 구간을 제압합니다.|Repeated barrages control a wide area.|連続砲撃で広い範囲を制圧します。|用连续炮击压制广阔区域。|Les barrages successifs contrôlent une vaste zone.|Las ráfagas controlan una zona amplia.|Rajadas sucessivas controlam uma área ampla.|लगातार गोलाबारी बड़े क्षेत्र को काबू में रखती है।
강한 연속 포격으로 적의 빈틈을 노립니다.|Punish openings with heavy barrages.|強い連続砲撃で敵の隙を突きます。|用猛烈连射抓住敌方空当。|Exploitez les ouvertures par des barrages lourds.|Castiga descuidos con ráfagas pesadas.|Explore brechas com barragens pesadas.|मौका मिलते ही भारी गोलाबारी करें।
빠른 기동과 날카로운 포격이 강점입니다.|Quick moves and precise shots are its strengths.|速い移動と鋭い砲撃が得意です。|擅长快速机动与精确炮击。|Vif en mouvement et précis au tir.|Destaca por su agilidad y precisión.|Destaca-se pela agilidade e precisão.|तेज़ चाल और सटीक निशाना इसकी ताकत हैं।
이온탄과 펄스로 전선을 압박합니다.|Pressure the front with ion shells and pulses.|イオン弾とパルスで戦線を押します。|用离子弹和脉冲压制战线。|Obus ioniques et impulsions pressent le front.|Proyectiles iónicos y pulsos presionan el frente.|Projéteis iônicos e pulsos pressionam a frente.|आयन गोलों और पल्स से मोर्चे पर दबाव डालें।
빠르게 자리를 바꾸고 선공 기회를 만듭니다.|Reposition fast and seize the first shot.|素早く位置を変え、先手を取ります。|快速换位，抢先出手。|Changez vite de position pour tirer le premier.|Cambia de posición rápido y dispara primero.|Mude rápido de posição para atirar primeiro.|तेज़ी से जगह बदलें और पहले गोली चलाएँ।
물폭탄으로 상대의 이동을 봉쇄합니다.|Water bombs stop enemy movement.|水爆弾で相手の移動を封じます。|用水弹封锁敌人移动。|Les bombes d’eau bloquent l’ennemi.|Las bombas de agua bloquean el movimiento.|Bombas d’água bloqueiam o movimento.|पानी के बम दुश्मन की चाल रोकते हैं।
튼튼한 전선에서 묵직하게 밀어붙입니다.|A sturdy front line for forceful attacks.|頑丈な前線で重い攻撃を繰り出します。|依靠坚实前线强势推进。|Solide en première ligne, puissant à l’attaque.|Resiste en primera línea y ataca con fuerza.|Resiste na linha de frente e ataca com força.|मज़बूत मोर्चे से भारी हमला करें।
독과 흡혈, 강화 해제로 전세를 바꿉니다.|Turn the tide with poison, life steal and dispels.|毒、吸血、強化解除で戦況を変えます。|用毒素、吸血和驱散扭转战局。|Poison, vol de vie et dissipation retournent le combat.|Veneno, robo de vida y disipación cambian el combate.|Veneno, roubo de vida e dissipação mudam a partida.|ज़हर, जीवन चोरी और बफ़ हटाकर बाज़ी पलटें।
튀어 오르는 공과 유도로 지형을 공략합니다.|Bouncing and homing balls exploit the terrain.|跳ね返る誘導ボールで地形を攻略します。|用反弹和追踪球攻击地形。|Exploitez le terrain avec des balles rebondissantes et guidées.|Aprovecha el terreno con pelotas de rebote y guiadas.|Explore o terreno com bolas quicantes e guiadas.|उछलती और पीछा करती गेंदों से भूभाग का लाभ लें।
각도와 지형을 활용하는 전술 캐릭터입니다.|A tactical character built around angles and terrain.|角度と地形を活かすキャラクターです。|擅长利用角度和地形的战术角色。|Un personnage tactique qui exploite angles et terrain.|Personaje táctico que aprovecha ángulos y terreno.|Personagem tático que explora ângulos e terreno.|कोण और भूभाग का लाभ लेने वाला पात्र।
{0} 선택|Select {0}|{0}を選択|选择 {0}|Choisir {0}|Elegir {0}|Escolher {0}|{0} चुनें
{0} 사용|Use {0}|{0}を使用|使用 {0}|Utiliser {0}|Usar {0}|Usar {0}|{0} इस्तेमाल करें
R{0} 해금|Unlocks R{0}|R{0}解放|第 {0} 回合解锁|Débloqué M{0}|Se abre en R{0}|Libera na R{0}|राउंड {0} में खुलेगा
DELAY +{0}|Delay +{0}|遅延 +{0}|延迟 +{0}|Délai +{0}|Retraso +{0}|Atraso +{0}|विलंब +{0}
남은 수량 없음|No uses left|残りなし|剩余次数为零|Plus d’utilisations|Agotado|Sem usos restantes|इस्तेमाल बाकी नहीं
이번 턴 아이템 사용 완료|Item used this turn|このターン使用済み|本回合已用道具|Objet déjà utilisé ce tour|Objeto usado este turno|Item usado neste turno|इस बारी की वस्तु इस्तेमाल हो चुकी है
체력이 가득 찼습니다|Health is full|HPは満タンです|生命值已满|Vie au maximum|Salud al máximo|Vida no máximo|स्वास्थ्य पूरा है
독 {0}회|Poison ×{0}|毒 ×{0}|中毒 ×{0}|Poison ×{0}|Veneno ×{0}|Veneno ×{0}|ज़हर ×{0}
화염 {0}회|Burn ×{0}|炎上 ×{0}|灼烧 ×{0}|Brûlure ×{0}|Quemadura ×{0}|Queimadura ×{0}|जलन ×{0}
이동 봉쇄|Movement blocked|移動封じ|移动受阻|Déplacement bloqué|Movimiento bloqueado|Movimento bloqueado|चलना बंद
방어막 {0}회|Shield ×{0}|シールド ×{0}|护盾 ×{0}|Bouclier ×{0}|Escudo ×{0}|Escudo ×{0}|ढाल ×{0}
흡수막 {0}|Barrier {0}|吸収障壁 {0}|吸收屏障 {0}|Barrière {0}|Barrera {0}|Barreira {0}|अवरोध {0}
공격 강화|Attack boost|攻撃強化|攻击强化|Bonus d’attaque|Mejora de ataque|Ataque reforçado|हमला बढ़ा
더블 준비|Double ready|ダブル準備完了|双发就绪|Double prêt|Doble listo|Duplo pronto|दोहरा तैयार
이동탄 준비|Teleport ready|移動弾準備完了|传送弹就绪|Téléportation prête|Teletransporte listo|Teleporte pronto|टेलीपोर्ट तैयार
이동탄 · 1발|Teleport shot · 1 projectile|移動弾 · 1発|传送弹 · 1 发|Téléportation · 1 projectile|Teletransporte · 1 proyectil|Teleporte · 1 projétil|टेलीपोर्ट · 1 गोली
자신에게 사용|Use on self|自分に使用|对自己使用|Sur soi-même|Usar en uno mismo|Usar em si|खुद पर इस्तेमाल
지원탄|Support|支援弾|支援弹|Soutien|Apoyo|Suporte|सहायता
공격|Attack|攻撃|攻击|Attaque|Ataque|Ataque|हमला
{0} · {1}발 / {2}회 포격|{0} · {1} shots / {2} volleys|{0} · {1}発 / {2}連射|{0} · {1} 发 / {2} 轮|{0} · {1} tirs / {2} salves|{0} · {1} disparos / {2} salvas|{0} · {1} disparos / {2} salvas|{0} · {1} गोलियाँ / {2} बार
{0} · {1}발|{0} · {1} shots|{0} · {1}発|{0} · {1} 发|{0} · {1} tirs|{0} · {1} disparos|{0} · {1} disparos|{0} · {1} गोलियाँ
{0}발|{0} shots|{0}発|{0} 发|{0} tirs|{0} disparos|{0} disparos|{0} गोलियाँ
피해 없이 착탄 지점으로 이동합니다.|Move to the impact point without causing damage.|ダメージを与えず着弾地点へ移動します。|移动至落点，不造成伤害。|Se déplace jusqu’à l’impact sans infliger de dégâts.|Te lleva al impacto sin causar daño.|Move até o impacto sem causar dano.|बिना क्षति दिए गिरने की जगह पहुँचें।
직전 조준 {0}° / {1}% ↺|Recall {0}° / {1}% ↺|前回 {0}° / {1}% ↺|恢复 {0}° / {1}% ↺|Rétablir {0}° / {1}% ↺|Restaurar {0}° / {1}% ↺|Restaurar {0}° / {1}% ↺|लौटाएँ {0}° / {1}% ↺
직전 이동탄의 각도·파워·방향을 복원합니다. 현재 바람과 지형을 확인하세요.|Recall the last teleport shot. Check the current wind and terrain.|前回の移動弾を復元。現在の風と地形を確認してください。|恢复上次传送弹。请查看当前风向和地形。|Rappelle le dernier tir de téléportation. Vérifiez vent et terrain.|Recupera el último teletransporte. Revisa el viento y el terreno.|Recupera o último teleporte. Confira o vento e o terreno.|पिछला टेलीपोर्ट शॉट लौटाएँ। हवा और भूभाग देखें।
이 캐릭터의 직전 각도·파워·무기·방향을 복원합니다. 현재 바람과 지형을 확인하세요.|Recall this character’s last shot and weapon. Check the wind and terrain.|このキャラの前回の射撃と武器を復元。風と地形を確認してください。|恢复本角色上次射击和武器。请查看风向和地形。|Rappelle le dernier tir et l’arme. Vérifiez vent et terrain.|Recupera el último tiro y arma. Revisa viento y terreno.|Recupera o último tiro e arma. Confira vento e terreno.|पात्र की पिछली गोली और हथियार लौटाएँ। हवा और भूभाग देखें।
지원 효과 적용|Support applied|支援効果適用|支援生效|Soutien appliqué|Apoyo aplicado|Suporte aplicado|सहायता लागू
이동 완료|Moved|移動完了|移动完成|Déplacement effectué|Movimiento completado|Movimento concluído|चाल पूरी
지뢰 설치|Mine planted|地雷設置|地雷已布置|Mine posée|Mina colocada|Mina instalada|बारूदी सुरंग बिछी
상대 강화 효과 해제|Enemy buffs removed|相手の強化解除|已移除敌方增益|Bonus ennemis dissipés|Mejoras rivales disipadas|Bônus inimigos removidos|दुश्मन के बफ़ हटे
상대 피해 {0}|Enemy damage {0}|敵に {0} ダメージ|敌方伤害 {0}|Dégâts ennemis {0}|Daño enemigo {0}|Dano inimigo {0}|दुश्मन को {0} क्षति
{0}기 격파|{0} defeated|{0}機撃破|击毁 {0} 台|{0} éliminés|{0} destruidos|{0} destruídos|{0} परास्त
아군 피해 {0}|Friendly damage {0}|味方に {0} ダメージ|友方伤害 {0}|Dégâts alliés {0}|Daño aliado {0}|Dano aliado {0}|साथी को {0} क्षति
회복 +{0}|Heal +{0}|回復 +{0}|恢复 +{0}|Soin +{0}|Curación +{0}|Cura +{0}|उपचार +{0}
직접 피해 없음|No direct damage|直接ダメージなし|无直接伤害|Aucun dégât direct|Sin daño directo|Sem dano direto|सीधी क्षति नहीं
전투 결과|Battle result|戦闘結果|战斗结果|Résultat du combat|Resultado del combate|Resultado da batalha|युद्ध परिणाम
전투 종료|Battle over|戦闘終了|战斗结束|Combat terminé|Combate terminado|Batalha encerrada|युद्ध समाप्त
블루 팀 · {0}의 차례|Blue team · {0}’s turn|青チーム · {0}の番|蓝队 · {0} 的回合|Équipe bleue · tour de {0}|Equipo azul · turno de {0}|Equipe azul · vez de {0}|नीली टीम · {0} की बारी
레드 팀 · {0}의 차례|Red team · {0}’s turn|赤チーム · {0}の番|红队 · {0} 的回合|Équipe rouge · tour de {0}|Equipo rojo · turno de {0}|Equipe vermelha · vez de {0}|लाल टीम · {0} की बारी
레드 팀 · 조준 중…|Red team · aiming…|赤チーム · 照準中…|红队 · 瞄准中…|Équipe rouge · vise…|Equipo rojo · apuntando…|Equipe vermelha · mirando…|लाल टीम · निशाना लगा रही है…
포격 진행 중|Shot in flight|砲弾飛行中|炮弹飞行中|Projectile en vol|Proyectil en vuelo|Projétil em voo|गोली उड़ रही है
지형 변화 확인 중|Terrain settling|地形の変化を確認中|地形变化中|Terrain en stabilisation|Terreno estabilizándose|Terreno se estabilizando|भूभाग स्थिर हो रहा है
다음 차례를 준비합니다|Preparing next turn|次のターンを準備中|准备下一回合|Préparation du tour suivant|Preparando el próximo turno|Preparando o próximo turno|अगली बारी तैयार हो रही है
공격 3회 · 지원과 이동탄은 1회|Three volleys · support and teleport stay single|攻撃3連射 · 支援弾と移動弾は1回|攻击三轮 · 支援与传送弹一次|Trois salves · soutien et téléportation restent simples|Tres salvas · apoyo y teletransporte una vez|Três salvas · suporte e teleporte uma vez|तीन हमले · सहायता और टेलीपोर्ट एक बार
매 라운드 전원에게 추가 피해|Everyone takes extra damage each round|毎ラウンド全員に追加ダメージ|每回合所有人受到额外伤害|Tous subissent des dégâts à chaque manche|Todos reciben daño extra cada ronda|Todos sofrem dano extra a cada rodada|हर राउंड में सबको अतिरिक्त क्षति
한국 참고|Korean reference|韓国版参考|韩版参考|Référence coréenne|Referencia coreana|Referência coreana|कोरियाई संदर्भ
구현값|Simulation value|実装値|模拟值|Valeur simulée|Valor de simulación|Valor de simulação|सिमुलेशन मान
직전 발사 없음|No previous shot|前回の射撃なし|无上次射击|Aucun tir précédent|Sin tiro anterior|Sem disparo anterior|पिछली गोली नहीं
발사 방향 전환 · 현재 왼쪽|Reverse aim · currently left|方向反転 · 現在は左|切换方向 · 当前向左|Inverser le tir · vers la gauche|Invertir dirección · ahora a la izquierda|Inverter direção · à esquerda|दिशा बदलें · अभी बाईं ओर
발사 방향 전환 · 현재 오른쪽|Reverse aim · currently right|方向反転 · 現在は右|切换方向 · 当前向右|Inverser le tir · vers la droite|Invertir dirección · ahora a la derecha|Inverter direção · à direita|दिशा बदलें · अभी दाईं ओर
직전 착탄|Last impact|前回の着弾|上次落点|Dernier impact|Último impacto|Último impacto|पिछला प्रहार
지금은 발사할 수 없습니다.|Can’t fire right now.|今は発射できません。|现在无法发射。|Impossible de tirer maintenant.|No puedes disparar ahora.|Não é possível disparar agora.|अभी गोली नहीं चला सकते।
지금은 이 아이템을 사용할 수 없습니다.|Can’t use this item now.|今はこのアイテムを使えません。|现在无法使用此道具。|Cet objet ne peut pas être utilisé maintenant.|No puedes usar este objeto ahora.|Não é possível usar este item agora.|अभी यह वस्तु इस्तेमाल नहीं कर सकते।
{0} 차례|{0}’s turn|{0}の番|{0} 的回合|Tour de {0}|Turno de {0}|Vez de {0}|{0} की बारी
{0} 대기|{0} waits|{0}は待機|{0} 待命|{0} attend|{0} espera|{0} aguarda|{0} इंतज़ार करता है
{0} 회복 +{1}|{0} heals +{1}|{0}が回復 +{1}|{0} 恢复 +{1}|{0} se soigne +{1}|{0} se cura +{1}|{0} se cura +{1}|{0} का उपचार +{1}
{0} 흡혈 +{1}|{0} steals life +{1}|{0}が吸血 +{1}|{0} 吸血 +{1}|{0} vole de la vie +{1}|{0} roba vida +{1}|{0} rouba vida +{1}|{0} जीवन चुराता है +{1}
{0} 이동|{0} moves|{0}が移動|{0} 移动|{0} se déplace|{0} se mueve|{0} se move|{0} चलता है
{0} 강화 효과 해제|{0} loses buffs|{0}の強化解除|{0} 增益移除|{0} perd ses bonus|{0} pierde mejoras|{0} perde bônus|{0} के बफ़ हटे
{0} 공격 차단|{0} blocks a hit|{0}が攻撃を防ぐ|{0} 格挡攻击|{0} bloque le tir|{0} bloquea el ataque|{0} bloqueia o ataque|{0} ने हमला रोका
{0} 낙하!|{0} falls!|{0}が落下！|{0} 坠落！|{0} tombe !|¡{0} cae!|{0} caiu!|{0} गिरा!
{0} 격파!|{0} destroyed!|{0}撃破！|{0} 被击毁！|{0} détruit !|¡{0} destruido!|{0} destruído!|{0} नष्ट!
서든데스 · {0} 라운드|Sudden death · round {0}|延長戦 · 第{0}ラウンド|决胜回合 · 第 {0} 回合|Mort subite · manche {0}|Muerte súbita · ronda {0}|Morte súbita · rodada {0}|निर्णायक दौर · राउंड {0}
제한 시간 종료 · 턴을 넘깁니다|Time’s up · passing turn|時間切れ · ターン終了|时间到 · 结束回合|Temps écoulé · fin du tour|Tiempo agotado · pasa el turno|Tempo esgotado · passa a vez|समय पूरा · बारी बदली
{0} · {1}|{0} · {1}|{0} · {1}|{0} · {1}|{0} · {1}|{0} · {1}|{0} · {1}|{0} · {1}
`;

  const characters = `
캐터펄트|Catapult|カタパルト|投石车|Catapulte|Catapulta|Catapulta|गुलेल
크로스보우|Crossbow|クロスボウ|弩车|Arbalète|Ballesta|Besta|क्रॉसबो
캐논|Cannon|キャノン|加农炮|Canon|Cañón|Canhão|तोप
캐롯탱크|Carrot Tank
듀크탱크|Duke Tank
마인랜더|Mine Lander
미사일|Missile|ミサイル|导弹车|Missile|Misil|Míssil|मिसाइल
멀티미사일|Multi Missile
슈퍼탱크|Super Tank
레이저탱크|Laser Tank
이온어태커|Ion Attacker
세크윈드|Secwind
포세이돈|Poseidon
메카펀치|Mecha Punch
이블벨라|Evil Bella
야구소년|Baseball Boy|野球少年|棒球少年|Jeune lanceur|Chico béisbol|Garoto do beisebol|बेसबॉल खिलाड़ी
바위탄|Boulder|岩弾|石弹|Rocher|Roca|Rocha|पत्थर का गोला
화염탄|Flame Shell|火炎弾|火焰弹|Obus incendiaire|Proyectil incendiario|Projétil incendiário|आग का गोला
강철 화살|Steel Arrow|鋼の矢|钢箭|Flèche d’acier|Flecha de acero|Flecha de aço|इस्पात तीर
독 화살|Poison Arrow|毒の矢|毒箭|Flèche empoisonnée|Flecha venenosa|Flecha venenosa|ज़हरीला तीर
지형 파쇄탄|Terrain Breaker|地形破砕弾|破地弹|Obus de démolition|Proyectil de demolición|Projétil de demolição|भूभाग तोड़ने वाला गोला
집중 포탄|Focused Shell|集中砲弾|集中炮弹|Obus concentré|Proyectil concentrado|Projétil concentrado|केंद्रित गोला
철갑탄|Armor Piercer|徹甲弾|穿甲弹|Obus perforant|Proyectil perforante|Projétil perfurante|कवच भेदी गोला
삼연발|Triple Burst|三連射|三连发|Rafale triple|Ráfaga triple|Rajada tripla|तीन गोलियों की बौछार
직격 포탄|Direct Shell|直撃砲弾|直击炮弹|Obus direct|Proyectil directo|Projétil direto|सीधा गोला
산개 포탄|Scatter Shell|散開砲弾|散射炮弹|Obus dispersant|Proyectil disperso|Projétil disperso|बिखरने वाला गोला
견제 포탄|Suppressive Shell|けん制砲弾|牵制炮弹|Obus de pression|Proyectil de supresión|Projétil de contenção|दबाव वाला गोला
매설 지뢰|Buried Mine|埋設地雷|埋设地雷|Mine enterrée|Mina enterrada|Mina enterrada|दबी बारूदी सुरंग
파쇄 미사일|Breaker Missile|破砕ミサイル|破坏导弹|Missile de rupture|Misil de ruptura|Míssil de ruptura|विध्वंस मिसाइल
유도 미사일|Homing Missile|誘導ミサイル|制导导弹|Missile guidé|Misil guiado|Míssil guiado|निर्देशित मिसाइल
삼연 미사일|Triple Missile|三連ミサイル|三连导弹|Trois missiles|Misil triple|Míssil triplo|तीन मिसाइलें
구연 미사일|Nine Missiles|九連ミサイル|九连导弹|Neuf missiles|Nueve misiles|Nove mísseis|नौ मिसाइलें
중화력 삼연포|Heavy Triple Cannon|重三連砲|重型三连炮|Canon triple lourd|Cañón triple pesado|Canhão triplo pesado|भारी तीन-गोली तोप
집중 구연포|Focused Nine-Shot|集中九連砲|集中九连炮|Salve concentrée de neuf|Salva concentrada de nueve|Salva concentrada de nove|केंद्रित नौ गोलियाँ
레이저 펄스|Laser Pulse|レーザーパルス|激光脉冲|Impulsion laser|Pulso láser|Pulso laser|लेज़र पल्स
분산 레이저|Scatter Laser|拡散レーザー|散射激光|Laser dispersé|Láser disperso|Laser disperso|बिखरता लेज़र
이온탄|Ion Shell|イオン弾|离子弹|Obus ionique|Proyectil iónico|Projétil iônico|आयन गोला
위성 펄스|Satellite Pulse|衛星パルス|卫星脉冲|Impulsion satellite|Pulso satelital|Pulso de satélite|उपग्रह पल्स
플라즈마탄|Plasma Shell|プラズマ弾|等离子弹|Obus plasma|Proyectil de plasma|Projétil de plasma|प्लाज़्मा गोला
쌍열 펄스|Twin Pulse|双連パルス|双管脉冲|Double impulsion|Pulso doble|Pulso duplo|दोहरा पल्स
물폭탄|Water Bomb|水爆弾|水弹|Bombe d’eau|Bomba de agua|Bomba d’água|पानी का बम
구속 물폭탄|Binding Water Bomb|拘束水爆弾|束缚水弹|Bombe d’eau entravante|Bomba de agua inmovilizadora|Bomba d’água de imobilização|रोकने वाला पानी बम
대형바위|Heavy Boulder|大型岩弾|大型石弹|Gros rocher|Roca pesada|Rocha pesada|भारी पत्थर
화염바위|Flame Boulder|炎の岩|火焰巨石|Rocher enflammé|Roca llameante|Rocha em chamas|जलता पत्थर
화산 폭발탄|Volcanic Burst|火山爆発弾|火山爆裂弹|Explosion volcanique|Explosión volcánica|Explosão vulcânica|ज्वालामुखी विस्फोट
대형 물리방패|Heavy Shield|大型シールド|大型物理盾|Bouclier lourd|Escudo pesado|Escudo pesado|भारी ढाल
로켓펀치|Rocket Punch|ロケットパンチ|火箭拳|Poing-fusée|Puño cohete|Soco foguete|रॉकेट मुक्का
메카킥|Mecha Kick|メカキック|机甲踢|Coup de pied mécanique|Patada mecánica|Chute mecânico|मशीन लात
펄스레이저|Pulse Laser|パルスレーザー|脉冲激光|Laser pulsé|Láser de pulsos|Laser pulsado|पल्स लेज़र
플라즈마실드|Plasma Shield|プラズマシールド|等离子护盾|Bouclier plasma|Escudo de plasma|Escudo de plasma|प्लाज़्मा ढाल
피의구슬|Blood Orb|血の球|血之球|Orbe de sang|Orbe de sangre|Orbe de sangue|रक्त गोला
맹독박쥐|Venom Bats|猛毒コウモリ|剧毒蝙蝠|Chauves-souris venimeuses|Murciélagos venenosos|Morcegos venenosos|ज़हरीले चमगादड़
흡혈박쥐떼|Vampire Swarm|吸血コウモリの群れ|吸血蝙蝠群|Nuée vampirique|Enjambre vampírico|Enxame vampírico|पिशाच चमगादड़ों का झुंड
유틸해제|Dispel Shot|強化解除弾|驱散弹|Tir de dissipation|Disparo disipador|Disparo dissipador|बफ़ हटाने वाली गोली
퉁퉁안타|Bouncing Hit|バウンドヒット|反弹安打|Frappe rebondissante|Golpe de rebote|Rebatida quicante|उछलता प्रहार
화염마구|Fire Pitch|炎の魔球|火焰魔球|Lancer de feu|Lanzamiento de fuego|Arremesso de fogo|आग की गेंद
통통유도볼|Homing Bouncer|誘導バウンド球|追踪弹跳球|Balle guidée rebondissante|Pelota guiada de rebote|Bola guiada quicante|पीछा करती उछलती गेंद
증폭기어|Amplifier Gear|増幅ギア|增幅装备|Amplificateur|Amplificador|Amplificador|शक्ति बढ़ाने वाला गियर
회복|Heal|回復|恢复|Soin|Curación|Cura|उपचार
방어막|Shield|シールド|护盾|Bouclier|Escudo|Escudo|ढाल
더블|Double|ダブル|双发|Double|Doble|Duplo|दोहरा
이동탄|Teleport Shot|移動弾|传送弹|Tir de téléportation|Disparo de teletransporte|Disparo de teleporte|टेलीपोर्ट गोली
클래식 최대 HP 20% · BLUE3 회복량 5% 모델. 사용 후 발사할 수 있다.|Heal 20% in Classic or 5% in BLUE3. You can still fire.|クラシック20%、BLUE3では5%回復。使用後も射撃できます。|经典恢复20%，BLUE3恢复5%，之后仍可射击。|Soigne 20 % en Classique ou 5 % en BLUE3. Vous pouvez encore tirer.|Cura 20 % en Clásico o 5 % en BLUE3. Después puedes disparar.|Cura 20% no Clássico ou 5% no BLUE3. Ainda é possível disparar.|क्लासिक में 20% या BLUE3 में 5% स्वास्थ्य लौटाएँ। फिर गोली चला सकते हैं।
다음 공격 1회를 막는다. 연속탄은 각각 판정한다.|Block the next hit. Each projectile counts separately.|次の攻撃を1回防ぐ。連射は弾ごとに判定。|抵挡下一次命中。连发逐发计算。|Bloque le prochain impact. Chaque projectile compte séparément.|Bloquea el próximo impacto. Cada proyectil cuenta por separado.|Bloqueia o próximo impacto. Cada projétil conta separadamente.|अगला प्रहार रोकें। हर गोली अलग गिनी जाती है।
다음 공격을 같은 각도와 힘으로 2회 반복하도록 준비한다. 지원기·턴 넘기기 후에도 준비 효과가 남는다.|Repeat your next attack at the same angle and power. Support and passing keep it armed.|次の攻撃を同じ角度とパワーで2回行う。支援やパスでは消費しない。|下次攻击以相同角度和力度打两次。支援和跳过不会消耗。|Double la prochaine attaque. Le soutien et la passe ne la consomment pas.|Duplica el próximo ataque. Apoyar o pasar no gasta el efecto.|Duplica o próximo ataque. Suporte e passar a vez não consomem o efeito.|अगला हमला उसी कोण और शक्ति से दो बार होगा। सहायता या बारी छोड़ने से असर बना रहता है।
다음 발사를 이동탄으로 바꾸고 착탄 지점으로 이동한다.|Turn the next shot into a teleport to its impact point.|次の射撃で着弾地点へ移動する。|下一发变为传送弹，移动至落点。|Le prochain tir vous téléporte au point d’impact.|El próximo disparo te lleva al punto de impacto.|O próximo disparo teleporta até o ponto de impacto.|अगली गोली आपको उसके गिरने की जगह पहुँचाएगी।
곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.|One arcing shell damages enemies and destroys terrain.|弧を描く砲弾1発で敵と地形を攻撃。|一发弧线炮弹伤敌并破坏地形。|Un obus en cloche blesse l’ennemi et détruit le terrain.|Un proyectil en arco daña al enemigo y destruye terreno.|Um projétil em arco causa dano e destrói terreno.|घुमावदार गोला दुश्मन को क्षति देता और भूभाग तोड़ता है।
착탄 지점에 불길을 남겨 지속 피해를 줍니다.|Leaves flames at impact that deal damage over time.|着弾地点の炎が持続ダメージを与えます。|落点留下火焰，持续造成伤害。|Les flammes à l’impact infligent des dégâts persistants.|Las llamas causan daño continuo en el impacto.|As chamas no impacto causam dano contínuo.|गिरने की जगह आग लगातार क्षति देती है।
착탄 지점에 불길을 남겨 상대에게 지속 피해를 줍니다.|Leaves flames at impact that deal damage over time.|着弾地点の炎が持続ダメージを与えます。|落点留下火焰，持续造成伤害。|Les flammes à l’impact infligent des dégâts persistants.|Las llamas causan daño continuo en el impacto.|As chamas no impacto causam dano contínuo.|गिरने की जगह आग लगातार क्षति देती है।
착탄 피해와 독을 남겨 이후 차례에도 피해를 준다.|Deals impact damage and poisons future turns.|着弾ダメージと毒で以後のターンも攻撃。|命中伤害并施毒，后续回合继续伤害。|Frappe puis empoisonne pour les tours suivants.|Daña al impacto y envenena los turnos siguientes.|Causa dano no impacto e envenena turnos futuros.|प्रहार के बाद ज़हर अगली बारियों में भी क्षति देता है।
한 번의 공격에 {0}발을 분산 발사합니다.|Fires {0} projectiles in a spread.|1回の攻撃で{0}発を拡散発射。|一次攻击散射 {0} 发。|Tire {0} projectiles en éventail.|Dispara {0} proyectiles en abanico.|Dispara {0} projéteis em leque.|फैलाव में {0} गोलियाँ चलती हैं।
지면에 지뢰를 남긴다. 가까이 접근한 기체가 기폭시킨다.|Plants a mine triggered by a nearby tank.|地雷を設置し、近づいた機体で起爆。|布设地雷，附近坦克会触发。|Pose une mine déclenchée par un char proche.|Coloca una mina que se activa al acercarse un tanque.|Instala mina acionada por um tanque próximo.|पास आने वाले टैंक से बारूदी सुरंग फटती है।
하강 중 적을 추적하는 유도탄 1발을 보냅니다.|Launches a missile that homes in while falling.|落下中に敵を追う誘導弾を1発発射。|发射一枚下落时追踪敌人的导弹。|Lance un missile qui suit l’ennemi en descendant.|Lanza un misil que rastrea al enemigo al descender.|Lança um míssil que persegue o inimigo ao cair.|गिरती मिसाइल दुश्मन का पीछा करती है।
물폭탄으로 피해를 주고 다음 두 차례의 이동을 막는다. 밀쳐내기 효과는 없다.|Damages and blocks movement for two turns, without knockback.|ダメージを与え、移動を2ターン封じる。ノックバックなし。|造成伤害并禁锢两回合，不击退。|Inflige des dégâts et immobilise deux tours, sans recul.|Daña e inmoviliza dos turnos, sin empuje.|Causa dano e imobiliza por dois turnos, sem empurrar.|क्षति देता है और दो बारियों तक चाल रोकता है, धक्का नहीं देता।
무거운 바위 1발로 상대와 지형을 함께 공격합니다.|Hurls one heavy boulder at enemies and terrain.|重い岩1発で相手と地形を攻撃。|用一块重石同时攻击对手与地形。|Lance un gros rocher sur l’ennemi et le terrain.|Lanza una roca pesada contra el rival y el terreno.|Arremessa uma rocha pesada no inimigo e no terreno.|एक भारी पत्थर दुश्मन और ज़मीन को मारता है।
큰 폭발과 화염으로 넓은 범위의 상대와 지형을 공격합니다.|A wide explosion and fire damage enemies and terrain.|広範囲の爆発と炎で敵と地形を攻撃。|大范围爆炸和火焰攻击敌人与地形。|Explosion et flammes touchent les ennemis et le terrain.|Explosión amplia y fuego dañan enemigos y terreno.|Explosão ampla e fogo atingem inimigos e terreno.|बड़ा विस्फोट और आग दुश्मन और भूभाग को क्षति देते हैं।
자신에게 피해 {0}을 흡수하는 방어막을 더합니다. 사용하면 차례를 마칩니다.|Shield yourself against {0} damage and end your turn.|{0}ダメージを吸収するシールドを張り、ターン終了。|获得吸收 {0} 伤害的护盾并结束回合。|Absorbe {0} dégâts et termine le tour.|Absorbe {0} de daño y termina el turno.|Absorve {0} de dano e encerra o turno.|{0} क्षति सोखने वाली ढाल लगाएँ और बारी समाप्त करें।
펀치형 충격탄으로 피해를 주고 상대를 밀어냅니다.|A punch projectile damages and knocks the enemy back.|パンチ弾でダメージとノックバック。|拳形冲击弹造成伤害并击退。|Un coup de poing inflige des dégâts et repousse l’ennemi.|El puño causa daño y empuja al rival.|O soco causa dano e empurra o inimigo.|मुक्के का गोला दुश्मन को क्षति और धक्का देता है।
묵직한 충격탄으로 주변을 공격하고 상대를 밀어냅니다.|Heavy impact damages the area and knocks enemies back.|重い衝撃で周囲を攻撃し、相手を弾く。|重型冲击攻击周围并击退敌人。|Un impact lourd blesse et repousse à proximité.|Impacto pesado daña y empuja a los cercanos.|Impacto pesado causa dano e empurra inimigos próximos.|भारी टक्कर आसपास क्षति देती है और दुश्मनों को धकेलती है।
중력과 바람의 영향을 받지 않는 직선 레이저를 발사합니다.|Fires a straight laser unaffected by gravity or wind.|重力や風を受けない直線レーザーを発射。|发射不受重力和风影响的直线激光。|Tire un laser droit, sans effet du vent ni de la gravité.|Dispara un láser recto inmune al viento y la gravedad.|Dispara um laser reto sem efeito do vento ou gravidade.|सीधा लेज़र हवा और गुरुत्व से नहीं बदलता।
피의 구슬 1발로 상대를 포격하고 지형을 파괴합니다.|One blood orb hits the enemy and destroys terrain.|血の球1発で相手と地形を攻撃。|一发血之球炮击对手并破坏地形。|Un orbe de sang frappe l’ennemi et détruit le terrain.|Un orbe de sangre golpea y destruye terreno.|Um orbe de sangue acerta o inimigo e destrói terreno.|एक रक्त गोला दुश्मन को मारता और भूभाग तोड़ता है।
독을 남기는 박쥐 6발을 퍼뜨려 쏩니다. 독은 이후 차례에도 피해를 줍니다.|Scatter six bats that poison enemies into later turns.|毒を残すコウモリを6発拡散。毒は以後のターンも有効。|散射六只毒蝙蝠，毒素持续伤害。|Disperse six chauves-souris qui empoisonnent plusieurs tours.|Esparce seis murciélagos que envenenan varios turnos.|Espalha seis morcegos que envenenam por turnos.|छह चमगादड़ फैलते हैं और अगली बारियों में ज़हर से क्षति देते हैं।
적을 추적하고 실제로 준 피해의 25%만큼 자신의 HP를 회복합니다.|Tracks the enemy and heals you for 25% of actual damage dealt.|敵を追尾し、実ダメージの25%分のHPを回復。|追踪敌人，按实际伤害的25%恢复自身生命。|Suit l’ennemi et soigne de 25 % des dégâts infligés.|Persigue al rival y cura el 25 % del daño real infligido.|Persegue o inimigo e cura 25% do dano real causado.|दुश्मन का पीछा करता है और वास्तविक क्षति का 25% स्वास्थ्य लौटाता है।
명중 범위 안 적의 방어·공격 강화를 지우는 지원탄 1발입니다. 반복 발사하지 않습니다.|One support shot removes enemy defense and attack buffs in range. It does not repeat.|範囲内の防御・攻撃強化を消す支援弾1発。連射しません。|一发支援弹清除范围内敌方攻防增益，不重复发射。|Un tir de soutien dissipe les bonus ennemis à portée, sans répétition.|Un disparo de apoyo disipa mejoras rivales en el área. No se repite.|Um tiro de suporte dissipa bônus inimigos na área. Não se repete.|एक सहायता गोली पास के दुश्मनों के हमले और रक्षा बफ़ हटाती है। यह दोहराती नहीं।
지형에서 한 번 반사되는 공을 쏩니다. 명중하면 피해를 주고 상대를 밀어냅니다.|The ball bounces once. A hit causes damage and knockback.|地形で1回反射する球。命中でダメージとノックバック。|球在地形上反弹一次。命中造成伤害并击退。|La balle rebondit une fois. Un impact blesse et repousse.|La pelota rebota una vez. Al impactar daña y empuja.|A bola quica uma vez. O impacto causa dano e empurra.|गेंद एक बार उछलती है। लगने पर क्षति और धक्का देती है।
착탄 지점에 불길을 남기는 공으로 지속 피해를 줍니다.|The ball leaves flames that deal ongoing damage.|着弾地点に炎を残し、持続ダメージを与える球。|球在落点留下火焰，造成持续伤害。|La balle laisse des flammes qui infligent des dégâts persistants.|La pelota deja llamas que causan daño continuo.|A bola deixa chamas que causam dano contínuo.|गेंद आग छोड़ती है जो लगातार क्षति देती है।
적을 추적하며 지형에서 최대 두 번 반사되는 공을 발사합니다.|Fires a homing ball that can bounce up to twice.|敵を追い、地形で最大2回反射する球を発射。|发射追踪球，最多在地形反弹两次。|Lance une balle guidée qui rebondit jusqu’à deux fois.|Lanza una pelota guiada que rebota hasta dos veces.|Dispara bola guiada que quica até duas vezes.|पीछा करती गेंद दो बार तक उछलती है।
자신의 다음 두 차례 동안 공격을 20% 강화합니다. 사용하면 차례를 마칩니다.|Boost attack by 20% for your next two turns and end this turn.|次の2ターン攻撃力を20%強化し、現在のターンを終了。|接下来两回合攻击提高20%，并结束当前回合。|Augmente l’attaque de 20 % pendant deux tours et termine celui-ci.|Sube el ataque un 20 % durante dos turnos y termina el actual.|Aumenta o ataque em 20% por dois turnos e encerra o atual.|अगली दो बारियों में हमला 20% बढ़ता है और यह बारी समाप्त होती है।
`;

  const settings = `
BATTLE COMPLETE|Battle complete|戦闘終了|战斗结束|Combat terminé|Combate terminado|Batalha concluída|युद्ध पूरा
BLUE SQUAD WINS|Blue team wins|青チームの勝利|蓝队获胜|L’équipe bleue gagne|Gana el equipo azul|A equipe azul venceu|नीली टीम जीती
RED SQUAD WINS|Red team wins|赤チームの勝利|红队获胜|L’équipe rouge gagne|Gana el equipo rojo|A equipe vermelha venceu|लाल टीम जीती
블루 승리|Blue wins|青の勝利|蓝队胜利|Victoire bleue|Victoria azul|Vitória azul|नीली टीम जीती
레드 승리|Red wins|赤の勝利|红队胜利|Victoire rouge|Victoria roja|Vitória vermelha|लाल टीम जीती
무승부|Draw|引き分け|平局|Match nul|Empate|Empate|बराबरी
서로의 전선을 끝까지 지켰습니다.|Both teams held their ground.|両チームが最後まで持ちこたえました。|双方坚持到了最后。|Les deux équipes ont tenu bon.|Ambos equipos resistieron.|As duas equipes resistiram.|दोनों टीमें अंत तक डटी रहीं।
다음 전투에서는 새로운 각도를 찾아보세요.|Try a different angle in the next battle.|次は別の角度を試しましょう。|下一场试试不同的角度。|Essayez un autre angle au prochain combat.|Prueba otro ángulo en el próximo combate.|Experimente outro ângulo na próxima batalha.|अगले युद्ध में दूसरा कोण आज़माएँ।
두 팀이 동시에 전멸했습니다.|Both teams were destroyed at once.|両チームが同時に全滅しました。|两队同时全灭。|Les deux équipes ont été éliminées en même temps.|Los dos equipos fueron eliminados a la vez.|As duas equipes foram eliminadas ao mesmo tempo.|दोनों टीमें एक साथ नष्ट हुईं।
제한 라운드 종료 시 두 팀의 체력 비율이 같습니다.|Both teams had the same health percentage at the round limit.|制限ラウンド終了時のHP割合が同じです。|回合上限时两队生命值比例相同。|Les deux équipes ont le même pourcentage de vie en fin de partie.|Ambos equipos tenían el mismo porcentaje de salud al final.|As duas equipes tinham a mesma porcentagem de vida no limite.|अंतिम राउंड में दोनों का स्वास्थ्य प्रतिशत बराबर था।
{0}가 준 피해|{0} damage dealt|{0}の与ダメージ|{0}造成伤害|Dégâts · {0}|Daño · {0}|Dano · {0}|{0} द्वारा क्षति
{0} 발사 탄 수|{0} shots fired|{0}の発射数|{0}发射数|Tirs · {0}|Disparos · {0}|Disparos · {0}|{0} की गोलियाँ
{0} 피해 {1} · {2}턴|{0} damage {1} · {2} turns|{0}のダメージ {1} · {2}ターン|{0}伤害 {1} · {2} 回合|Dégâts {0} : {1} · {2} tours|Daño {0}: {1} · {2} turnos|Dano {0}: {1} · {2} turnos|{0} की क्षति {1} · {2} बारियाँ
첫 번째 전투 기록을 남겨 보세요.|Play a battle to start your history.|まずは戦闘をプレイしましょう。|先完成一场战斗吧。|Jouez un combat pour commencer l’historique.|Juega una partida para empezar tu historial.|Jogue uma partida para iniciar seu histórico.|इतिहास शुरू करने के लिए एक लड़ाई खेलें।
중력|Gravity|重力|重力|Gravité|Gravedad|Gravidade|गुरुत्व
바람 가속 계수|Wind acceleration|風の加速係数|风加速度|Accélération du vent|Aceleración del viento|Aceleração do vento|हवा का त्वरण
최대 발사속도|Max launch speed|最大初速|最高发射速度|Vitesse initiale max.|Velocidad inicial máx.|Velocidade inicial máx.|अधिकतम प्रक्षेपण गति
피해 배율|Damage multiplier|ダメージ倍率|伤害倍率|Multiplicateur de dégâts|Multiplicador de daño|Multiplicador de dano|क्षति गुणक
지형 파괴 배율|Terrain damage multiplier|地形破壊倍率|地形破坏倍率|Multiplicateur de dégâts au terrain|Multiplicador de daño al terreno|Multiplicador de dano ao terreno|भूभाग क्षति गुणक
턴 시간(초)|Turn time (s)|ターン時間（秒）|回合时长（秒）|Durée du tour (s)|Tiempo de turno (s)|Tempo de turno (s)|बारी का समय (सेकंड)
일본 2003 문헌|Japan 2003 reference|日本2003年資料|日本 2003 年资料|Référence japonaise de 2003|Referencia japonesa de 2003|Referência japonesa de 2003|जापान 2003 संदर्भ
한국판 참고 · 빌드 미확정|Korean reference · build unknown|韓国版参考 · ビルド不明|韩版参考 · 构建未确认|Référence coréenne · version inconnue|Referencia coreana · versión sin confirmar|Referência coreana · versão desconhecida|कोरियाई संदर्भ · बिल्ड अज्ञात
한국 커뮤니티 보고값 · 적용 빌드 미확인|Reported in Korean community · build unknown|韓国コミュニティ報告 · ビルド不明|韩国社区报告 · 构建未知|Signalé par la communauté coréenne · version inconnue|Informado por la comunidad coreana · versión desconocida|Relato da comunidade coreana · versão desconhecida|कोरियाई समुदाय की रिपोर्ट · बिल्ड अज्ञात
일본 서비스 2003 문헌값 · 한국 BLUE와 판본 구분|Japanese service, 2003 · distinct from Korean BLUE|日本版2003年資料 · 韓国BLUEとは別の版|日本版 2003 年资料 · 与韩国 BLUE 版本有别|Service japonais de 2003 · distinct du BLUE coréen|Servicio japonés de 2003 · distinto del BLUE coreano|Serviço japonês de 2003 · distinto do BLUE coreano|जापानी 2003 सेवा · कोरियाई BLUE से अलग
3BLUE의 원작 발사각은 미복구이며 현재 구현값을 사용합니다.|3BLUE’s original angles are unknown. This mode uses simulation values.|3BLUEの元の射角は不明のため、実装値を使用します。|3BLUE 原版射角未知，目前使用模拟值。|Angles originaux de 3BLUE inconnus · valeurs simulées.|Se usan valores simulados porque se desconocen los ángulos de 3BLUE.|Usa valores simulados porque os ângulos de 3BLUE são desconhecidos.|3BLUE के मूल कोण अज्ञात हैं। सिमुलेशन मान इस्तेमाल होते हैं।
3BLUE 원작 각도 미복구 · 현재 구현값|3BLUE original angles unknown · simulation values|3BLUEの元の角度は不明 · 実装値|3BLUE 原版角度未知 · 模拟值|Angles 3BLUE inconnus · valeurs simulées|Ángulos originales de 3BLUE desconocidos · simulación|Ângulos originais de 3BLUE desconhecidos · simulação|3BLUE मूल कोण अज्ञात · सिमुलेशन मान
3BLUE 원작 각도 미복구 · 실행 범위는 구현값|3BLUE’s playable angle range is a simulation setting.|3BLUEの射角範囲は実装値です。|3BLUE 游戏射角范围为模拟参数。|La plage d’angle jouable de 3BLUE est simulée.|El rango jugable de 3BLUE es simulado.|A faixa jogável de 3BLUE é simulada.|3BLUE का खेलने योग्य कोण सिमुलेशन मान है।
다음 새 전투부터 선택한 발사각을 적용합니다.|The chosen angle reference applies next battle.|選んだ射角資料は次の戦闘から適用します。|所选射角资料从下场战斗开始生效。|La référence choisie s’applique au prochain combat.|La referencia elegida se aplica al próximo combate.|A referência escolhida vale na próxima batalha.|चुना हुआ कोण संदर्भ अगले युद्ध में लागू होगा।
다음 전투부터 기본 구현값을 사용합니다.|Default settings will apply next battle.|次の戦闘から初期値を使います。|下场战斗将使用默认值。|Les valeurs par défaut s’appliquent au prochain combat.|Los valores predeterminados se aplican al próximo combate.|Os valores padrão valem na próxima batalha.|अगले युद्ध से मूल मान लागू होंगे।
이 브라우저는 전체 화면을 지원하지 않습니다.|Fullscreen is unavailable in this browser.|このブラウザーでは全画面表示に対応していません。|此浏览器不支持全屏。|Le plein écran est indisponible dans ce navigateur.|Este navegador no admite pantalla completa.|Este navegador não oferece tela cheia.|इस ब्राउज़र में पूर्ण स्क्रीन उपलब्ध नहीं है।
전체 화면 전환을 사용할 수 없습니다.|Could not switch fullscreen mode.|全画面表示を切り替えられません。|无法切换全屏模式。|Impossible de basculer en plein écran.|No se pudo cambiar el modo de pantalla completa.|Não foi possível alternar a tela cheia.|पूर्ण स्क्रीन मोड नहीं बदल पाया।
직전 조준을 복원했습니다. 현재 바람과 지형을 확인하세요.|Previous aim restored. Check the current wind and terrain.|前回の照準を復元。現在の風と地形を確認してください。|已恢复上次瞄准。请查看当前风向与地形。|Visée précédente rétablie. Vérifiez vent et terrain.|Mira anterior restaurada. Revisa viento y terreno.|Mira anterior restaurada. Confira vento e terreno.|पिछला निशाना लौट आया। वर्तमान हवा और भूभाग देखें।
현재 발사각 자료|Active angle reference|現在の射角資料|当前射角资料|Référence d’angle active|Referencia angular actual|Referência angular atual|मौजूदा कोण संदर्भ
발사각 출처 {0} ↗|Angle source {0} ↗|射角出典 {0} ↗|射角来源 {0} ↗|Source d’angle {0} ↗|Fuente de ángulo {0} ↗|Fonte de ângulo {0} ↗|कोण स्रोत {0} ↗
출처 {0} ↗|Source {0} ↗|出典 {0} ↗|来源 {0} ↗|Source {0} ↗|Fuente {0} ↗|Fonte {0} ↗|स्रोत {0} ↗
클래식 13종 발사각 비교|Classic angle comparison · 13 tanks|クラシック13種の射角比較|经典 13 种坦克射角对比|Angles de 13 chars classiques|Ángulos de 13 tanques clásicos|Ângulos de 13 tanques clássicos|13 क्लासिक टैंकों के कोण
탱크|Tank|タンク|坦克|Char|Tanque|Tanque|टैंक
발사 파워 · 복원 범위|Shot power · recovery scope|発射パワーと復元範囲|射击力度与复原范围|Puissance et portée de la restauration|Potencia y alcance de la recuperación|Potência e escopo da recuperação|गोली की शक्ति और पुनर्प्राप्ति सीमा
각도·파워 복원 데이터 JSON ↓|Angle and power reference JSON ↓|角度・パワー復元資料 JSON ↓|角度与力度复原数据 JSON ↓|Données d’angle et de puissance JSON ↓|Datos de ángulo y potencia JSON ↓|Dados de ângulo e potência JSON ↓|कोण और शक्ति संदर्भ JSON ↓
플레이를 위해 정한 규칙|Simulation rules|プレイ用の追加ルール|模拟规则|Règles de simulation|Reglas de simulación|Regras de simulação|सिमुलेशन नियम
포격 모델|Artillery model|砲撃モデル|炮击模型|Modèle d’artillerie|Modelo de artillería|Modelo de artilharia|तोपखाना मॉडल
스킬별 근거|Skill sources|スキルの出典|技能资料|Sources des compétences|Fuentes de habilidades|Fontes das habilidades|कौशल स्रोत
맵과 아이템|Maps and items|マップとアイテム|地图与道具|Cartes et objets|Mapas y objetos|Mapas e itens|नक्शे और वस्तुएँ
복원 자료|Recovery data|復元資料|复原数据|Données récupérées|Datos recuperados|Dados recuperados|पुनर्प्राप्त डेटा
미복구|Unrecovered|未復元|未复原|Non récupéré|Sin recuperar|Não recuperado|पुनर्प्राप्त नहीं
`;

  const dictionary = {};
  function add(rows) {
    for (const line of rows.trim().split('\n')) {
      const [key, ...values] = line.split('|');
      if (values.length !== 1 && values.length !== locales.length) throw new Error(`Invalid Fortress War localization: ${key}`);
      dictionary[key] = Object.fromEntries(locales.map((locale, index) => [locale, values[index] ?? values[0]]));
    }
  }
  add(text);
  add(battle);
  add(characters);
  add(settings);
  PlayHubLocale.register(dictionary);
})();
