/** cloth_type: 'upper' = torso only, 'lower' = pants/jeans, 'overall' = full suit / dress */
/** image: require() for bundled assets, or string URL (e.g. Cloudinary) - URLs avoid APK resize issues */
export const CLOTHING_ITEMS: Array<{
  id: string;
  name: string;
  price: string;
  cloth_type: 'upper' | 'lower' | 'overall';
  image: number | string;
}> = [
  { id: '1', name: 'full suit', price: '$48', cloth_type: 'overall', image: 'https://res.cloudinary.com/dp3vs4mxa/image/upload/v1769873236/full_suit_hurxcg.png' },
  { id: '2', name: 'blue shirt', price: '$26', cloth_type: 'upper', image: 'https://res.cloudinary.com/dp3vs4mxa/image/upload/v1769873233/blue_shirt_xzvm4u.png' },
  { id: '3', name: 'colourfull-sweatshirt', price: '$25', cloth_type: 'upper', image: 'https://res.cloudinary.com/dp3vs4mxa/image/upload/v1769873233/colourfull-sweatshirt_v8mpbp.png' },
  { id: '4', name: 'Classic suit', price: '$45', cloth_type: 'upper', image: 'https://res.cloudinary.com/dp3vs4mxa/image/upload/v1769873233/green-tshirt_f3hnxr.png' },
  { id: '5', name: 'purple-shirt', price: '$28', cloth_type: 'upper', image: 'https://res.cloudinary.com/dp3vs4mxa/image/upload/v1769873233/purple-shirt_g9dnxn.png' },
  { id: '6', name: 'baggy black jeans', price: '$32', cloth_type: 'lower', image: 'https://res.cloudinary.com/dp3vs4mxa/image/upload/v1769873232/baggy_black_jeans_tjiqvm.png' },
];

export function getClothingById(id: string) {
  return CLOTHING_ITEMS.find((item) => item.id === id) ?? CLOTHING_ITEMS[0];
}
