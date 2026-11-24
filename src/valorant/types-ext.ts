/** 用户上传音频的元信息 */
export type CustomSoundMeta = { id: string; name: string; createdAt: number }

/** 自定义音频在配置里的引用前缀 */
export const CUSTOM_AUDIO_PREFIX = 'custom:'
export const IDB_AUDIO_PREFIX = 'idb:'
