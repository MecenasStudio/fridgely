export type FridgeItem = {
  id: string
  name: string
  quantity: number
  unit: string
  expiresOn: string | null
}

export type Ingredient = { name: string; quantity: number; unit: string }

export type Recipe = {
  id: string
  title: string
  ingredients: Ingredient[]
  steps: string[]
}
