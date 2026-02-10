import {
  getCategoryList,
  getChildCategoriesBySubcategory,
  getOuiAssetUrl,
  getSubcategoriesByCategory,
  type OuiCategory,
  type OuiChildCategory,
  type OuiSubCategory,
} from '@/lib/ouiApi';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Level = 'category' | 'subcategory' | 'child';
type ListItem = { id: number; name: string; imageUrl: string | null };

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string; categoryName?: string }>();
  const [level, setLevel] = useState<Level>('category');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<OuiCategory[]>([]);
  const [subcategories, setSubcategories] = useState<OuiSubCategory[]>([]);
  const [childCategories, setChildCategories] = useState<OuiChildCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCategoryList();
      const list = Array.isArray(res?.categories) ? res.categories : [];
      setCategories(list.filter((c) => c.status !== 0));
      setLevel('category');
      setCategoryId(null);
      setSubcategoryId(null);
      setSubcategories([]);
      setChildCategories([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const id = params.categoryId ? parseInt(params.categoryId, 10) : null;
    if (id && !Number.isNaN(id)) {
      setCategoryId(id);
      setLevel('subcategory');
      setLoading(true);
      getSubcategoriesByCategory(id)
        .then((res) => {
          setSubcategories(Array.isArray(res?.subCategories) ? res.subCategories : []);
        })
        .catch(() => setSubcategories([]))
        .finally(() => setLoading(false));
    }
  }, [params.categoryId]);

  const handleCategoryPress = useCallback((id: number) => {
    setCategoryId(id);
    setLevel('subcategory');
    setLoading(true);
    setError(null);
    getSubcategoriesByCategory(id)
      .then((res) => setSubcategories(Array.isArray(res?.subCategories) ? res.subCategories : []))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
        setSubcategories([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubcategoryPress = useCallback((id: number) => {
    setSubcategoryId(id);
    setLevel('child');
    setLoading(true);
    setError(null);
    getChildCategoriesBySubcategory(id)
      .then((res) => setChildCategories(Array.isArray(res?.childCategories) ? res.childCategories : []))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
        setChildCategories([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const goBack = useCallback(() => {
    if (level === 'child') {
      setLevel('subcategory');
      setSubcategoryId(null);
      setChildCategories([]);
    } else if (level === 'subcategory') {
      setLevel('category');
      setCategoryId(null);
      setSubcategories([]);
    } else {
      router.back();
    }
  }, [level, router]);

  const listItems: ListItem[] =
    level === 'category'
      ? categories.map((c) => ({ id: c.id, name: c.name, imageUrl: getOuiAssetUrl(c.image) ?? null }))
      : level === 'subcategory'
        ? subcategories.map((s) => ({ id: s.id, name: s.name, imageUrl: getOuiAssetUrl(s.image) ?? null }))
        : childCategories.map((c) => ({ id: c.id, name: c.name, imageUrl: getOuiAssetUrl(c.image) ?? null }));

  const title =
    level === 'category'
      ? 'Categories'
      : level === 'subcategory'
        ? 'Subcategories'
        : 'Child categories';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadCategories}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : loading && listItems.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6B4EAA" />
        </View>
      ) : listItems.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {level === 'category' ? 'No categories' : level === 'subcategory' ? 'No subcategories' : 'No child categories'}
          </Text>
          <Text style={styles.emptySubtext}>
            {level === 'category'
              ? 'There are no categories to show right now.'
              : level === 'subcategory'
                ? 'This category has no subcategories.'
                : 'This subcategory has no child categories.'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={goBack}>
            <Text style={styles.retryText}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                level === 'category'
                  ? handleCategoryPress(item.id)
                  : level === 'subcategory'
                    ? handleSubcategoryPress(item.id)
                    : undefined
              }
              activeOpacity={0.7}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.rowImage} />
              ) : (
                <View style={styles.rowImagePlaceholder} />
              )}
              <Text style={styles.rowText}>{item.name}</Text>
              {(level === 'category' || level === 'subcategory') && <Text style={styles.chevron}>›</Text>}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  backText: {
    fontSize: 17,
    color: '#6B4EAA',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 14,
    backgroundColor: '#f0f0f0',
  },
  rowImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 14,
    backgroundColor: '#eee',
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  chevron: {
    fontSize: 20,
    color: '#999',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#c00',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#6B4EAA',
    borderRadius: 10,
    marginTop: 16,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
