import mongoose, { Schema, type Model } from 'mongoose'

export type GachaBoxRareRates = { R: number; SR: number; UR: number }

export type GachaBoxConfigAttrs = {
  boxId: string
  /** null/undefined = use static default */
  gachaEnabled?: boolean | null
  urPerBox?: number | null
  srPerBox?: number | null
  packCost?: number | null
  rareRates?: Partial<GachaBoxRareRates> | null
}

type GachaBoxConfigModel = Model<GachaBoxConfigAttrs>

const rareRatesSchema = new Schema(
  {
    R: { type: Number },
    SR: { type: Number },
    UR: { type: Number },
  },
  { _id: false },
)

const gachaBoxConfigSchema = new Schema<GachaBoxConfigAttrs>(
  {
    boxId: { type: String, required: true, unique: true, index: true },
    gachaEnabled: { type: Boolean, default: null },
    urPerBox: { type: Number, default: null, min: 0 },
    srPerBox: { type: Number, default: null, min: 0 },
    packCost: { type: Number, default: null, min: 0 },
    rareRates: { type: rareRatesSchema, default: null },
  },
  { timestamps: true },
)

if (mongoose.models.GachaBoxConfig) {
  delete mongoose.models.GachaBoxConfig
  delete (mongoose.connection.models as Record<string, unknown>).GachaBoxConfig
}

export const GachaBoxConfig = mongoose.model<
  GachaBoxConfigAttrs,
  GachaBoxConfigModel
>('GachaBoxConfig', gachaBoxConfigSchema)
