/** cloth_type: 'upper' = torso only, 'lower' = pants/jeans, 'overall' = full suit / dress */
export const CLOTHING_ITEMS = [
  { id: '1', name: 'Colorful Sweatshirt', price: '$25', cloth_type: 'upper' as const, image: require('@/assets/clothes/colourfull-sweatshirt.jpg') },
  { id: '2', name: 'Green T-Shirt', price: '$20', cloth_type: 'upper' as const, image: require('@/assets/clothes/green-tshirt.png') },
  { id: '3', name: 'Purple Shirt', price: '$28', cloth_type: 'upper' as const, image: require('@/assets/clothes/purple-shirt.png') },
  { id: '4', name: 'Classic Suit', price: '$45', cloth_type: 'upper' as const, image: require('@/assets/clothes/suit.png') },
  { id: '5', name: 'Baggy Black Jeans', price: '$32', cloth_type: 'lower' as const, image: require('@/assets/clothes/baggy_black_jeans.png') },
  { id: '6', name: 'Blue Shirt', price: '$26', cloth_type: 'upper' as const, image: require('@/assets/clothes/blue_shirt.png') },
  { id: '7', name: 'Full Suit', price: '$48', cloth_type: 'overall' as const, image: require('@/assets/clothes/full_suit.png') },
];

export function getClothingById(id: string) {
  return CLOTHING_ITEMS.find((item) => item.id === id) ?? CLOTHING_ITEMS[0];
}
