/** 连续语音对话的文案字典；中文为 key 源，其余语言按同一组 key 校验。 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 字典命名空间。 */
export const NS = 'voice-conversation'

/** 中文文案（key 源）。 */
export const zh = {
  start: '开始语音对话',
  stop: '结束语音对话',
  panelTitle: '语音对话',
  preparing: '正在准备语音识别模型…',
  listening: '正在聆听，请说话',
  transcribing: '正在识别…',
  sending: '正在发送…',
  thinking: '等待回答…',
  speaking: '正在朗读，开口即可打断',
  lastHeard: '听到：{text}',
  'failure.permission': '麦克风权限未开启，请在系统设置中允许本应用访问麦克风。',
  'failure.unavailable': '当前环境无法使用麦克风或语音识别。',
  'failure.prepare': '语音识别模型未就绪，请在「语音输入」面板完成模型下载后重试。',
  'failure.transcribe': '没有识别成功，请再说一次。',
  'failure.send': '消息未能发送，请结束语音对话后重试。',
  'failure.interrupted': '麦克风连接已中断，请重新开始语音对话。',
}

/** 字典的 key 联合类型。 */
export type VoiceConversationKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 连续语音对话的 UI 文案。 */
    'voice-conversation': VoiceConversationKey
  }
}

/** 英文文案。 */
export const en = {
  start: 'Start voice conversation',
  stop: 'End voice conversation',
  panelTitle: 'Voice conversation',
  preparing: 'Preparing the speech model…',
  listening: 'Listening — go ahead and speak',
  transcribing: 'Transcribing…',
  sending: 'Sending…',
  thinking: 'Waiting for the reply…',
  speaking: 'Reading aloud — speak to interrupt',
  lastHeard: 'Heard: {text}',
  'failure.permission': 'Microphone access is off. Allow this app to use the microphone in system settings.',
  'failure.unavailable': 'This environment cannot use the microphone or speech recognition.',
  'failure.prepare': 'The speech model is not ready. Finish downloading it in the voice input panel, then try again.',
  'failure.transcribe': 'That was not recognized. Please say it again.',
  'failure.send': 'The message could not be sent. End voice conversation and try again.',
  'failure.interrupted': 'The microphone connection was lost. Start voice conversation again.',
} satisfies typeof zh

/** 日文文案。 */
export const ja = {
  start: '音声会話を開始',
  stop: '音声会話を終了',
  panelTitle: '音声会話',
  preparing: '音声認識モデルを準備しています…',
  listening: '聞き取り中です。話してください',
  transcribing: '認識中…',
  sending: '送信中…',
  thinking: '回答を待っています…',
  speaking: '読み上げ中。話しかけると中断します',
  lastHeard: '聞き取り：{text}',
  'failure.permission': 'マイクの権限が許可されていません。システム設定でこのアプリのマイク使用を許可してください。',
  'failure.unavailable': 'この環境ではマイクまたは音声認識を利用できません。',
  'failure.prepare': '音声認識モデルの準備ができていません。音声入力パネルでモデルのダウンロードを完了してから再試行してください。',
  'failure.transcribe': '認識できませんでした。もう一度話してください。',
  'failure.send': 'メッセージを送信できませんでした。音声会話を終了して再試行してください。',
  'failure.interrupted': 'マイク接続が切断されました。音声会話を開始し直してください。',
} satisfies typeof zh

/** 西班牙语文案。 */
export const es = {
  start: 'Iniciar conversación por voz',
  stop: 'Finalizar conversación por voz',
  panelTitle: 'Conversación por voz',
  preparing: 'Preparando el modelo de voz…',
  listening: 'Escuchando, puede hablar',
  transcribing: 'Transcribiendo…',
  sending: 'Enviando…',
  thinking: 'Esperando la respuesta…',
  speaking: 'Leyendo en voz alta; hable para interrumpir',
  lastHeard: 'Escuchado: {text}',
  'failure.permission': 'El micrófono no está autorizado. Permita que esta aplicación use el micrófono en los ajustes del sistema.',
  'failure.unavailable': 'Este entorno no puede usar el micrófono ni el reconocimiento de voz.',
  'failure.prepare': 'El modelo de voz no está listo. Complete la descarga en el panel de entrada de voz y vuelva a intentarlo.',
  'failure.transcribe': 'No se reconoció. Vuelva a decirlo.',
  'failure.send': 'No se pudo enviar el mensaje. Finalice la conversación por voz e inténtelo de nuevo.',
  'failure.interrupted': 'Se perdió la conexión con el micrófono. Inicie de nuevo la conversación por voz.',
} satisfies typeof zh

/** 法语文案。 */
export const fr = {
  start: 'Démarrer la conversation vocale',
  stop: 'Terminer la conversation vocale',
  panelTitle: 'Conversation vocale',
  preparing: 'Préparation du modèle vocal…',
  listening: 'Écoute en cours, parlez',
  transcribing: 'Transcription…',
  sending: 'Envoi…',
  thinking: 'En attente de la réponse…',
  speaking: 'Lecture en cours ; parlez pour interrompre',
  lastHeard: 'Entendu : {text}',
  'failure.permission': "L'accès au microphone est désactivé. Autorisez cette application à utiliser le microphone dans les réglages du système.",
  'failure.unavailable': "Cet environnement ne permet pas d'utiliser le microphone ni la reconnaissance vocale.",
  'failure.prepare': "Le modèle vocal n'est pas prêt. Terminez le téléchargement dans le panneau de saisie vocale, puis réessayez.",
  'failure.transcribe': "La parole n'a pas été reconnue. Veuillez répéter.",
  'failure.send': "Le message n'a pas pu être envoyé. Terminez la conversation vocale et réessayez.",
  'failure.interrupted': 'La connexion au microphone a été interrompue. Redémarrez la conversation vocale.',
} satisfies typeof zh

/** 德语文案。 */
export const de = {
  start: 'Sprachunterhaltung starten',
  stop: 'Sprachunterhaltung beenden',
  panelTitle: 'Sprachunterhaltung',
  preparing: 'Sprachmodell wird vorbereitet…',
  listening: 'Hört zu, bitte sprechen',
  transcribing: 'Erkennung…',
  sending: 'Senden…',
  thinking: 'Warte auf die Antwort…',
  speaking: 'Wird vorgelesen – zum Unterbrechen sprechen',
  lastHeard: 'Gehört: {text}',
  'failure.permission': 'Der Mikrofonzugriff ist deaktiviert. Erlauben Sie dieser App die Mikrofonnutzung in den Systemeinstellungen.',
  'failure.unavailable': 'Diese Umgebung kann Mikrofon oder Spracherkennung nicht verwenden.',
  'failure.prepare': 'Das Sprachmodell ist noch nicht bereit. Schließen Sie den Download im Spracheingabe-Panel ab und versuchen Sie es erneut.',
  'failure.transcribe': 'Das wurde nicht erkannt. Bitte erneut sprechen.',
  'failure.send': 'Die Nachricht konnte nicht gesendet werden. Beenden Sie die Sprachunterhaltung und versuchen Sie es erneut.',
  'failure.interrupted': 'Die Mikrofonverbindung wurde unterbrochen. Starten Sie die Sprachunterhaltung neu.',
} satisfies typeof zh

/** 俄语文案。 */
export const ru = {
  start: 'Начать голосовой диалог',
  stop: 'Завершить голосовой диалог',
  panelTitle: 'Голосовой диалог',
  preparing: 'Подготовка модели распознавания…',
  listening: 'Слушаю, говорите',
  transcribing: 'Распознавание…',
  sending: 'Отправка…',
  thinking: 'Ожидание ответа…',
  speaking: 'Читаю вслух — говорите, чтобы прервать',
  lastHeard: 'Услышано: {text}',
  'failure.permission': 'Доступ к микрофону отключён. Разрешите этому приложению использовать микрофон в системных настройках.',
  'failure.unavailable': 'В этой среде микрофон или распознавание речи недоступны.',
  'failure.prepare': 'Модель распознавания не готова. Завершите загрузку на панели голосового ввода и повторите попытку.',
  'failure.transcribe': 'Речь не распознана. Повторите, пожалуйста.',
  'failure.send': 'Не удалось отправить сообщение. Завершите голосовой диалог и попробуйте снова.',
  'failure.interrupted': 'Соединение с микрофоном прервано. Начните голосовой диалог заново.',
} satisfies typeof zh

/** 葡萄牙语文案。 */
export const pt = {
  start: 'Iniciar conversa por voz',
  stop: 'Encerrar conversa por voz',
  panelTitle: 'Conversa por voz',
  preparing: 'Preparando o modelo de voz…',
  listening: 'Ouvindo, pode falar',
  transcribing: 'Transcrevendo…',
  sending: 'Enviando…',
  thinking: 'Aguardando a resposta…',
  speaking: 'Lendo em voz alta; fale para interromper',
  lastHeard: 'Ouvido: {text}',
  'failure.permission': 'O acesso ao microfone está desativado. Permita que este aplicativo use o microfone nas configurações do sistema.',
  'failure.unavailable': 'Este ambiente não pode usar o microfone nem o reconhecimento de voz.',
  'failure.prepare': 'O modelo de voz não está pronto. Conclua o download no painel de entrada de voz e tente novamente.',
  'failure.transcribe': 'Não foi reconhecido. Repita, por favor.',
  'failure.send': 'Não foi possível enviar a mensagem. Encerre a conversa por voz e tente novamente.',
  'failure.interrupted': 'A conexão com o microfone foi interrompida. Inicie novamente a conversa por voz.',
} satisfies typeof zh
