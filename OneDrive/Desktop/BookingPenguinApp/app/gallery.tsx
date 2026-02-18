import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToGallery,
  uploadPhoto,
  deletePhoto,
  updateCaption,
  GalleryPhoto,
} from '@/services/gallery';
import Colors from '@/constants/Colors';

const SCREEN_W = Dimensions.get('window').width;
const COLS = 2;
const GAP = 10;
const CARD_W = (SCREEN_W - GAP * 3) / COLS;

function getPhotoUrl(photo: GalleryPhoto): string {
  return photo.imageUrl || photo.url || photo.thumbnailUrl || '';
}

function timeAgo(photo: GalleryPhoto): string {
  const ts = photo.createdAt;
  if (!ts) return '';
  const seconds = ts?.seconds || (typeof ts === 'number' ? ts : 0);
  if (!seconds) return '';
  const diff = Date.now() - seconds * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

export default function GalleryScreen() {
  const { businessId, firebaseUser, userDoc } = useAuth();
  const authUid = firebaseUser?.uid || '';
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadCaption, setUploadCaption] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMember, setFilterMember] = useState<'all' | string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  // Lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState<GalleryPhoto | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');

  useEffect(() => {
    if (!businessId) return;
    const unsub = subscribeToGallery(
      businessId,
      (data) => { setPhotos(data); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, [businessId]);

  const uploaders = useMemo(() => {
    const map: Record<string, string> = {};
    photos.forEach((p) => {
      if (p.uploadedBy && p.uploaderName) map[p.uploadedBy] = p.uploaderName;
    });
    return Object.entries(map);
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    let result = [...photos];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          (p.caption || '').toLowerCase().includes(q) ||
          (p.uploaderName || '').toLowerCase().includes(q) ||
          (p.fileName || '').toLowerCase().includes(q)
      );
    }
    if (filterMember !== 'all') {
      result = result.filter((p) => p.uploadedBy === filterMember);
    }
    if (sortOrder === 'oldest') {
      result.reverse();
    }
    return result;
  }, [photos, searchQuery, filterMember, sortOrder]);

  const selectedMemberName = filterMember === 'all'
    ? 'All members'
    : uploaders.find(([uid]) => uid === filterMember)?.[1] || 'Member';

  const maxPhotos = 100;

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const manipulated = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    setSelectedUri(manipulated.uri);
    setSelectedBase64(manipulated.base64 || null);
    setUploadCaption('');
    setShowUploadModal(true);
  }

  async function handleUpload() {
    if (!selectedBase64 || !businessId) return;
    setUploading(true);
    try {
      const fileName = `gallery_${Date.now()}.jpg`;
      await uploadPhoto(businessId, selectedBase64, uploadCaption.trim(), fileName);
      setShowUploadModal(false);
      setSelectedUri(null);
      setSelectedBase64(null);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(photo: GalleryPhoto) {
    Alert.alert('Delete Photo', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(photo.id);
            if (lightboxPhoto?.id === photo.id) setLightboxPhoto(null);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete.');
          }
        },
      },
    ]);
  }

  async function handleSaveCaption() {
    if (!lightboxPhoto) return;
    try {
      await updateCaption(lightboxPhoto.id, captionDraft.trim());
      setLightboxPhoto((p) => p ? { ...p, caption: captionDraft.trim() } : null);
      setEditingCaption(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save caption.');
    }
  }

  function openLightbox(photo: GalleryPhoto) {
    setLightboxPhoto(photo);
    setCaptionDraft(photo.caption || '');
    setEditingCaption(false);
  }

  function renderCard({ item }: { item: GalleryPhoto }) {
    const uri = getPhotoUrl(item);
    const name = item.uploaderName || 'Unknown';
    const ini = getInitials(name);
    return (
      <Pressable onPress={() => openLightbox(item)} style={gs.card}>
        {uri ? (
          <Image source={{ uri }} style={gs.cardImage} />
        ) : (
          <View style={[gs.cardImage, gs.cardImagePlaceholder]}>
            <FontAwesome name="image" size={28} color={Colors.light.textMuted} />
          </View>
        )}
        <View style={gs.cardInfo}>
          <View style={gs.uploaderRow}>
            <View style={gs.uploaderAvatar}>
              <Text style={gs.uploaderInitials}>{ini}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={gs.uploaderName} numberOfLines={1}>{name}</Text>
              <Text style={gs.uploadTime}>{timeAgo(item)}</Text>
            </View>
          </View>
          {item.caption ? <Text style={gs.cardCaption} numberOfLines={2}>{item.caption}</Text> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Gallery',
          headerStyle: { backgroundColor: Colors.light.headerBg },
          headerTintColor: Colors.light.headerText,
          headerTitleAlign: 'center',
        }}
      />
      <View style={gs.container}>
        {/* Header */}
        <View style={gs.headerRow}>
          <View>
            <Text style={gs.pageTitle}>Work Gallery</Text>
            <Text style={gs.photoCount}>{photos.length} / {maxPhotos} photos</Text>
          </View>
          <Pressable style={gs.uploadHeaderBtn} onPress={pickImage}>
            <FontAwesome name="plus" size={12} color="#fff" />
            <Text style={gs.uploadHeaderBtnText}>Upload Photos</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={gs.searchRow}>
          <View style={gs.searchInputWrapper}>
            <FontAwesome name="search" size={14} color={Colors.light.textMuted} />
            <TextInput
              style={gs.searchInput}
              placeholder="Search by name, caption..."
              placeholderTextColor={Colors.light.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <FontAwesome name="times-circle" size={16} color={Colors.light.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Filter row */}
        <View style={gs.filterRow}>
          <Pressable style={gs.dropdown} onPress={() => setShowMemberPicker(true)}>
            <FontAwesome name="user" size={12} color={Colors.light.textSecondary} />
            <Text style={gs.dropdownText} numberOfLines={1}>{selectedMemberName}</Text>
            <FontAwesome name="caret-down" size={12} color={Colors.light.textMuted} />
          </Pressable>

          <Pressable
            style={gs.dropdown}
            onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
          >
            <FontAwesome name="sort" size={12} color={Colors.light.textSecondary} />
            <Text style={gs.dropdownText}>{sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}</Text>
            <FontAwesome name="caret-down" size={12} color={Colors.light.textMuted} />
          </Pressable>
        </View>

        {/* Grid */}
        {loading ? (
          <View style={gs.centered}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
          </View>
        ) : filteredPhotos.length === 0 ? (
          <View style={gs.centered}>
            <FontAwesome name="camera" size={48} color={Colors.light.textMuted} />
            <Text style={gs.emptyTitle}>{photos.length === 0 ? 'No Photos Yet' : 'No matches'}</Text>
            <Text style={gs.emptySubtitle}>{photos.length === 0 ? 'Tap Upload Photos to get started.' : 'Try adjusting your filters.'}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredPhotos}
            keyExtractor={(i) => i.id}
            renderItem={renderCard}
            numColumns={COLS}
            contentContainerStyle={{ paddingHorizontal: GAP, paddingTop: GAP, paddingBottom: 40 }}
            columnWrapperStyle={{ gap: GAP }}
            ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          />
        )}
      </View>

      {/* Member Picker Modal */}
      <Modal visible={showMemberPicker} transparent animationType="fade" onRequestClose={() => setShowMemberPicker(false)}>
        <Pressable style={gs.pickerOverlay} onPress={() => setShowMemberPicker(false)}>
          <View style={gs.pickerCard}>
            <Text style={gs.pickerTitle}>Filter by Member</Text>
            <Pressable
              style={[gs.pickerOption, filterMember === 'all' && gs.pickerOptionActive]}
              onPress={() => { setFilterMember('all'); setShowMemberPicker(false); }}
            >
              <FontAwesome name="users" size={14} color={filterMember === 'all' ? Colors.light.tint : Colors.light.textSecondary} />
              <Text style={[gs.pickerOptionText, filterMember === 'all' && gs.pickerOptionTextActive]}>All members</Text>
              {filterMember === 'all' && <FontAwesome name="check" size={14} color={Colors.light.tint} />}
            </Pressable>
            {uploaders.map(([uid, name]) => (
              <Pressable
                key={uid}
                style={[gs.pickerOption, filterMember === uid && gs.pickerOptionActive]}
                onPress={() => { setFilterMember(uid); setShowMemberPicker(false); }}
              >
                <View style={gs.pickerAvatar}>
                  <Text style={gs.pickerAvatarText}>{getInitials(name)}</Text>
                </View>
                <Text style={[gs.pickerOptionText, filterMember === uid && gs.pickerOptionTextActive]}>{name}</Text>
                {filterMember === uid && <FontAwesome name="check" size={14} color={Colors.light.tint} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Upload Modal */}
      <Modal visible={showUploadModal} transparent animationType="slide" onRequestClose={() => setShowUploadModal(false)}>
        <View style={gs.modalOverlay}>
          <View style={gs.modalCard}>
            <View style={gs.modalHeader}>
              <Text style={gs.modalTitle}>Upload Photo</Text>
              <Pressable onPress={() => setShowUploadModal(false)} hitSlop={12}>
                <FontAwesome name="times" size={20} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
            {selectedUri && (
              <Image source={{ uri: selectedUri }} style={gs.previewImage} resizeMode="cover" />
            )}
            <Text style={gs.inputLabel}>Caption / Title</Text>
            <TextInput
              style={gs.captionInput}
              placeholder="Give this photo a caption or title"
              placeholderTextColor={Colors.light.textMuted}
              value={uploadCaption}
              onChangeText={setUploadCaption}
              maxLength={200}
            />
            <Pressable
              style={[gs.uploadBtn, uploading && { opacity: 0.6 }]}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={gs.uploadBtnText}>Upload</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Lightbox */}
      <Modal visible={!!lightboxPhoto} transparent animationType="fade" onRequestClose={() => setLightboxPhoto(null)}>
        <View style={gs.lightboxOverlay}>
          <Pressable style={gs.lightboxClose} onPress={() => setLightboxPhoto(null)}>
            <FontAwesome name="times" size={24} color="#fff" />
          </Pressable>

          {lightboxPhoto && (
            <>
              <Image
                source={{ uri: getPhotoUrl(lightboxPhoto) }}
                style={gs.lightboxImage}
                resizeMode="contain"
              />
              <View style={gs.lightboxInfo}>
                <Text style={gs.lightboxUploader}>
                  {lightboxPhoto.uploaderName || 'Unknown'} · {timeAgo(lightboxPhoto)}
                </Text>
              </View>
              <View style={gs.lightboxFooter}>
                {editingCaption ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 }}>
                    <TextInput
                      style={gs.lightboxCaptionInput}
                      value={captionDraft}
                      onChangeText={setCaptionDraft}
                      placeholder="Caption"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      maxLength={200}
                    />
                    <Pressable onPress={handleSaveCaption} hitSlop={8}>
                      <FontAwesome name="check" size={18} color={Colors.light.success} />
                    </Pressable>
                    <Pressable onPress={() => setEditingCaption(false)} hitSlop={8}>
                      <FontAwesome name="times" size={18} color="#fff" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setEditingCaption(true)} style={{ flex: 1 }}>
                    <Text style={gs.lightboxCaption}>
                      {lightboxPhoto.caption || 'Tap to add caption'}
                    </Text>
                  </Pressable>
                )}
                <Pressable onPress={() => handleDelete(lightboxPhoto)} style={gs.lightboxDelete}>
                  <FontAwesome name="trash-o" size={18} color={Colors.light.danger} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>
    </>
  );
}

const gs = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.light.text, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: Colors.light.textMuted, marginTop: 4 },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  photoCount: { fontSize: 13, color: Colors.light.textMuted, marginTop: 2 },
  uploadHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  uploadHeaderBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Search
  searchRow: { paddingHorizontal: 16, paddingTop: 12 },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.light.text },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  dropdownText: { flex: 1, fontSize: 13, fontWeight: '500', color: Colors.light.text },

  // Member picker modal
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  pickerCard: {
    width: SCREEN_W - 60,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 20,
    maxHeight: '60%',
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginBottom: 14 },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  pickerOptionActive: {},
  pickerOptionText: { flex: 1, fontSize: 15, color: Colors.light.text },
  pickerOptionTextActive: { fontWeight: '600', color: Colors.light.tint },
  pickerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerAvatarText: { fontSize: 10, fontWeight: '700', color: Colors.light.tint },

  // Grid cards
  card: {
    width: CARD_W,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  cardImage: { width: '100%', height: CARD_W * 0.85, backgroundColor: Colors.light.border },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light.borderLight },
  cardInfo: { padding: 10 },
  uploaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploaderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploaderInitials: { fontSize: 9, fontWeight: '700', color: Colors.light.tint },
  uploaderName: { fontSize: 12, fontWeight: '600', color: Colors.light.text },
  uploadTime: { fontSize: 10, color: Colors.light.textMuted },
  cardCaption: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 6, lineHeight: 15 },

  // Upload modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.light.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  previewImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: Colors.light.border, marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary, marginBottom: 6 },
  captionInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14,
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
    marginBottom: 16,
  },
  uploadBtn: { backgroundColor: Colors.light.tint, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Lightbox
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  lightboxClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  lightboxImage: { width: SCREEN_W - 24, height: SCREEN_W, maxHeight: '65%' },
  lightboxInfo: { position: 'absolute', bottom: 80, left: 20, right: 20 },
  lightboxUploader: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  lightboxFooter: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lightboxCaption: { color: '#fff', fontSize: 14, flex: 1 },
  lightboxCaptionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  lightboxDelete: { padding: 8, marginLeft: 8 },
});
