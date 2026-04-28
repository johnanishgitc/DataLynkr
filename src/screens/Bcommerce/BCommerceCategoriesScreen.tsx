import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Dimensions,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import SystemNavigationBar from '../../utils/systemNavBar';
import { getStockItemsFromDataManagementCache } from '../../cache/stockItemsCacheReader';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 4;
const ITEM_WIDTH = (width - 64) / COLUMN_COUNT;

type EntryType = 'parent' | 'category';

interface CategoryEntry {
  name: string;
  type: EntryType;
  parent?: string;
}

export default function BCommerceCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  
  const initialCategory = (route.params as any)?.selectedCategory || null;
  const initialParent = (route.params as any)?.selectedParent || null;

  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedParent, setSelectedParent] = useState<string | null>(initialParent === 'All' ? null : initialParent);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory === 'All' ? null : initialCategory);
  const [searchQuery, setSearchQuery] = useState('');



  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true);
        const result = await getStockItemsFromDataManagementCache();
        if (result && Array.isArray(result.data)) {
          setAllItems(result.data);
        } else {
          setAllItems([]);
        }
      } catch (err) {
        console.warn('Error fetching items in Categories screen:', err);
        setAllItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const { entries } = useMemo(() => {
    const pSet = new Set<string>();
    const cSet = new Set<string>();
    
    allItems.forEach((i: any) => {
      const p = i.PARENT || i.parent;
      const c = i.CATEGORY || i.category;
      if (p) pSet.add(p);
      if (c) cSet.add(c);
    });

    const parentsList: CategoryEntry[] = Array.from(pSet)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ name, type: 'parent' }));
      
    const categoriesList: CategoryEntry[] = Array.from(cSet)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ name, type: 'category' }));

    return { entries: [...parentsList, ...categoriesList] };
  }, [allItems]);

  const filteredEntries = entries.filter(e => 
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getIcon = (item: CategoryEntry, isSelected: boolean) => {
    return (
      <Text style={{ 
        fontFamily: 'WorkSans-VariableFont_wght', 
        fontSize: 24, 
        fontWeight: 'bold', 
        color: isSelected ? '#1f3a89' : '#4a5565' 
      }}>
        {item.name ? item.name.charAt(0).toUpperCase() : '?'}
      </Text>
    );
  };

  const handleEntryPress = (item: CategoryEntry) => {
    if (item.type === 'parent') {
      if (selectedParent === item.name) {
        setSelectedParent(null);
      } else {
        setSelectedParent(item.name);
      }
    } else {
      if (selectedCategory === item.name) {
        setSelectedCategory(null);
      } else {
        setSelectedCategory(item.name);
      }
    }
  };

  const isEnabled = (entry: CategoryEntry) => {
    if (!selectedParent && !selectedCategory) return true;
    if (entry.name === selectedParent || entry.name === selectedCategory) return true;

    return allItems.some(item => {
      const itemP = item.PARENT || item.parent;
      const itemC = item.CATEGORY || item.category;

      let match = true;
      if (selectedParent && itemP !== selectedParent) match = false;
      if (selectedCategory && itemC !== selectedCategory) match = false;

      if (!match) return false;
      return itemP === entry.name || itemC === entry.name;
    });
  };

  const handleConfirm = () => {
    navigation.navigate('BCommerce', { 
      selectedCategory: selectedCategory || 'All',
      selectedParent: selectedParent || 'All'
    } as any);
  };

  const renderEntryItem = ({ item }: { item: CategoryEntry }) => {
    const enabled = isEnabled(item);
    const isSelected = selectedCategory === item.name || selectedParent === item.name;
    
    return (
      <TouchableOpacity 
        style={[styles.categoryItem, !enabled && { opacity: 0.3 }]} 
        onPress={() => enabled && handleEntryPress(item)}
        activeOpacity={0.7}
        disabled={!enabled}
      >
        <View style={[styles.iconCircle, isSelected && styles.iconCircleSelected]}>
          {getIcon(item, isSelected)}
        </View>
        <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelSelected]} numberOfLines={1}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Categories</Text>
        {(selectedParent || selectedCategory) ? (
          <TouchableOpacity 
            onPress={() => { setSelectedParent(null); setSelectedCategory(null); }}
            style={{ marginRight: 8 }}
          >
            <Text style={{ color: '#1f3a89', fontWeight: '600' }}>Reset</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Icon name="magnify" size={22} color="#bdbdbd" style={styles.searchIcon} />
          <TextInput
            placeholder="Search Categories or Groups..."
            placeholderTextColor="#bdbdbd"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Grid */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0e172b" />
          <Text style={{ marginTop: 12, color: '#4a5565', fontFamily: 'WorkSans-VariableFont_wght' }}>Loading categories...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          renderItem={renderEntryItem}
          keyExtractor={(item, index) => `${item.type}-${item.name}-${index}`}
          numColumns={COLUMN_COUNT}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ marginTop: 60, alignItems: 'center' }}>
              <Icon name="package-variant" size={64} color="#f0f0f0" />
              <Text style={{ marginTop: 16, color: '#999', fontSize: 16 }}>No items found</Text>
            </View>
          }
        />
      )}

      {/* Confirm Button */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmText}>Confirm Selection</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f6f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#121111',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#121111',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  categoryItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    marginBottom: 24,
    marginHorizontal: 4,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f5f6f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconCircleSelected: {
    backgroundColor: '#e6ecfd',
    borderWidth: 1.5,
    borderColor: '#1f3a89',
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4a5565',
    fontFamily: 'WorkSans-VariableFont_wght',
    textAlign: 'center',
  },
  categoryLabelSelected: {
    color: '#1f3a89',
    fontWeight: '700',
  },
  parentBadge: {
    marginTop: 2,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  parentBadgeText: {
    fontSize: 8,
    color: '#888',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  confirmButton: {
    height: 54,
    backgroundColor: '#0e172b',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
});
