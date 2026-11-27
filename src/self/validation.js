const { z } = require('zod');
const id = z.string().regex(/^[a-f0-9]{24}$/);
const text = z.string().trim().max(10000);
const time = z.iso.datetime({ offset: true });
const base = {
  occurredAt: time,
  title: z.string().trim().min(1, '請填寫標題').max(120, '標題最多 120 個字'),
  note: text.default(''),
  images: z.array(id).max(4).default([]),
};
const entry = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('diet'),
    data: z
      .object({
        meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink'], {
          error: '請選擇餐別',
        }),
        food: z.string().trim().max(4100).default(''),
        drinks: z.string().trim().max(1000).default(''),
        appetite: z
          .number({ error: '請填寫食慾分數' })
          .int('食慾必須是整數')
          .min(1, '食慾最低 1 分')
          .max(10, '食慾最高 10 分'),
      })
      .refine((data) => !!(data.food || data.drinks), {
        message: '請填寫飲食內容',
      }),
  }),

  z.object({
    ...base,
    kind: z.literal('mood'),
    data: z
      .object({
        score: z
          .number({ error: '請選擇此刻心情' })
          .int('心情必須是整數')
          .min(1, '心情最低 1 分')
          .max(10, '心情最高 10 分'),
        scale: z.literal(10).optional(),
        selfHarmUrge: z.number().int().min(0).max(10).optional(),
        suicideUrge: z.number().int().min(0).max(10).optional(),
        selfHarmed: z.boolean().optional(),
        suicideAttempted: z.boolean().optional(),
        legacyScore: z.number().int().min(1).max(5).optional(),
        emotions: z.string().max(200),
        trigger: z.string().max(1000),
      })
      .refine((data) => data.scale === 10 || data.score <= 5, {
        message: '請使用十分制記錄心情',
      }),
  }),
  z.object({
    ...base,
    kind: z.literal('sleep'),
    data: z
      .object({
        bedtime: time,
        wakeAt: time,
        quality: z
          .number({ error: '請選擇睡眠品質' })
          .int()
          .min(1, '請選擇睡眠品質')
          .max(5),
      })
      .refine(
        (d) =>
          new Date(d.wakeAt) > new Date(d.bedtime) &&
          new Date(d.wakeAt) - new Date(d.bedtime) <= 48 * 3600000,
        { message: '起床時間須晚於入睡時間，且在 48 小時內' },
      ),
  }),
  z.object({
    ...base,
    kind: z.literal('body'),
    data: z.object({
      metric: z.enum([
        'weight',
        'temperature',
        'heartRate',
        'systolic',
        'diastolic',
        'other',
      ]),
      value: z
        .number({ error: '請填寫有效的量測數值' })
        .positive('量測數值必須大於零')
        .max(10000, '量測數值過大，請檢查內容'),
      unit: z.string().trim().min(1, '請填寫單位').max(30),
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('medication'),
    data: z.object({
      period: z.enum(['morning', 'noon', 'evening', 'bedtime'], {
        error: '請選擇用藥時段',
      }),
      status: z.enum(['taken', 'skipped'], { error: '請選擇是否服用' }),
      medicine: z.string().max(120).optional(),
      dose: z.string().max(100).optional(),
      reaction: z.string().max(2000),
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('reflection'),
    data: z.object({
      prompt: z.string().max(500).optional(),
      content: z.string().trim().min(1, '請填寫我的想法').max(10000),
      gratitude: z.string().max(2000).optional(),
    }),
  }),
  z.object({
    ...base,
    kind: z.literal('appointment'),
    data: z.object({
      session: z.enum(['morning', 'afternoon', 'evening'], {
        error: '請選擇看診時段',
      }),
      number: z.string().trim().max(30, '看診號碼最多 30 個字').default(''),
      hospital: z.string().max(120).optional(),
      department: z.string().max(120).optional(),
      doctor: z.string().max(120).optional(),
      questions: z.string().max(5000),
    }),
  }),
]);
module.exports = { id, entry };
