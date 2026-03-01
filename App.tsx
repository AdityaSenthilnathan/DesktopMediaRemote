import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  StatusBar as RNStatusBar,
  Platform,
  Animated,
  PanResponder,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtMs(ms: number) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${pad2(s)}`;
}

export default function App() {
  const [host, setHost] = useState("http://192.168.86.63:3001"); // change this
  const [token, setToken] = useState("tok");
  const [status, setStatus] = useState("Idle");
  const [data, setData] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const drawerHeight = Math.max(160, Math.min(240, Math.round(height * 0.33)));
  const drawerClosedY = -drawerHeight;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const drawerY = useRef(new Animated.Value(drawerClosedY)).current;
  const drawerOpenRef = useRef(false);

  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  async function getNowPlaying() {
    try {
      setStatus("Fetching...");
      const res = await fetch(`${host}/now-playing?art=true`, { headers });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`);
      }
      const json = await res.json();
      setData(json);
      setStatus("OK");
    } catch (e: any) {
      setStatus(e.message || "Error");
      setData(null);
    }
  }

  async function post(path: string) {
    try {
      setStatus("Sending...");
      const res = await fetch(`${host}${path}`, { method: "POST", headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await getNowPlaying();
    } catch (e: any) {
      setStatus(e.message || "Error");
    }
  }

  useEffect(() => {
    RNStatusBar.setHidden(true, "none");
    if (Platform.OS === "android") {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor("transparent");
    }

    getNowPlaying();
    timerRef.current = setInterval(getNowPlaying, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [host, token]);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  useEffect(() => {
    drawerY.setValue(drawerClosedY);
    setDrawerOpen(false);
  }, [drawerClosedY, drawerY]);

  function animateDrawer(open: boolean) {
    setDrawerOpen(open);
    Animated.spring(drawerY, {
      toValue: open ? 0 : drawerClosedY,
      useNativeDriver: true,
      speed: 20,
      bounciness: 0,
    }).start();
  }

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => drawerY.stopAnimation(),
        onPanResponderMove: (_, g) => {
          const start = drawerOpenRef.current ? 0 : drawerClosedY;
          const next = Math.max(drawerClosedY, Math.min(0, start + g.dy));
          drawerY.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const shouldOpen = drawerOpenRef.current ? g.dy > -35 : g.dy > 35;
          animateDrawer(shouldOpen);
        },
        onPanResponderTerminate: () => animateDrawer(drawerOpenRef.current),
      }),
    [drawerClosedY]
  );

  const artUri = useMemo(() => {
    if (!data?.albumArtBase64) return null;
    const mime = data.albumArtMime || "image/jpeg";
    return `data:${mime};base64,${data.albumArtBase64}`;
  }, [data]);

  const progress = useMemo(() => {
    if (!data?.durationMs || data.durationMs <= 0) return 0;
    const pct = data.positionMs / data.durationMs;
    return Math.min(1, Math.max(0, pct || 0));
  }, [data]);

  const showEmpty = !data || data.spotifyFound === false;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} {...drawerPanResponder.panHandlers}>
        <StatusBar hidden={true} animated={false} />

        {drawerOpen && <Pressable style={styles.scrim} onPress={() => animateDrawer(false)} />}

        <Animated.View
          style={[
            styles.drawer,
            {
              height: drawerHeight,
              transform: [{ translateY: drawerY }],
            },
          ]}
          {...drawerPanResponder.panHandlers}
        >
          <View style={styles.drawerHandle} />
          <Text style={styles.drawerTitle}>Connection Settings</Text>
          <View style={[styles.configCard, isLandscape && styles.configCardLandscape]}>
            <TextInput
              value={host}
              onChangeText={setHost}
              placeholder="Server URL"
              placeholderTextColor="#7a7a7a"
              style={[styles.input, isLandscape && styles.inputLandscape]}
              autoCapitalize="none"
            />
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholder="Token"
              placeholderTextColor="#7a7a7a"
              style={[styles.input, isLandscape && styles.inputLandscape]}
              autoCapitalize="none"
            />
          </View>
          <Text style={styles.statusText} numberOfLines={1}>
            {status}
          </Text>
        </Animated.View>

        <View style={styles.screen}>
          <View style={styles.topArea}>
            <View style={styles.artBox}>
              {artUri ? (
                <Image source={{ uri: artUri }} style={styles.art} resizeMode="cover" />
              ) : (
                <View style={styles.artPlaceholder}>
                  <Text style={styles.muted}>
                    {!data ? "No data" : data.spotifyFound === false ? "Spotify not found" : "No artwork"}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.metaBox}>
              <View style={styles.metaTextWrap}>
                <Text style={styles.title} numberOfLines={2}>
                  {showEmpty ? "Not playing" : data.title}
                </Text>
                {!showEmpty && (
                  <>
                    <Text style={styles.artistText} numberOfLines={1}>
                      {data.artist}
                    </Text>
                    <Text style={styles.albumText} numberOfLines={1}>
                      {data.album}
                    </Text>
                  </>
                )}
              </View>

              <View style={styles.metaControls}>
                <View style={styles.controls}>
                  <Pressable style={styles.iconBtn} onPress={() => post("/previous")}>
                    <Text style={styles.iconBtnText}>{"\u23EE"}</Text>
                  </Pressable>

                  <Pressable style={[styles.iconBtn, styles.playBtn]} onPress={() => post("/play-pause")}>
                    <MaterialIcons
                      name={data?.isPlaying ? "pause" : "play-arrow"}
                      size={40}
                      color="#fff"
                    />
                  </Pressable>

                  <Pressable style={styles.iconBtn} onPress={() => post("/next")}>
                    <Text style={styles.iconBtnText}>{"\u23ED"}</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{fmtMs(data?.positionMs || 0)}</Text>
                    <Text style={styles.timeText}>{fmtMs(data?.durationMs || 0)}</Text>
                  </View>
                </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 4,
  },

  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 7,
    backgroundColor: "#0b0b0b",
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  drawerHandle: {
    alignSelf: "center",
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#2a2a2a",
    marginBottom: 8,
  },
  drawerTitle: { color: "#fff", fontWeight: "700", fontSize: 14, marginBottom: 8 },
  configCard: { backgroundColor: "#111", borderRadius: 14, padding: 12 },
  configCardLandscape: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    backgroundColor: "#000",
    color: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#222",
  },
  inputLandscape: { flex: 1, marginBottom: 0 },
  statusText: { marginTop: 10, color: "#9a9a9a", fontSize: 12 },

  screen: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 0,
    gap: 8,
  },

  topArea: { flex: 1, flexDirection: "row", gap: 12 },

  artBox: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#050505",
    borderWidth: 0,
  },
  art: { width: "100%", height: "100%" },
  artPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },

  metaBox: {
    flex: 1.3,
    borderRadius: 16,
    backgroundColor: "#070707",
    borderWidth: 0,
    padding: 14,
    justifyContent: "space-between",
  },

  metaTextWrap: { gap: 4 },
  title: {
    color: "#f8f8f8",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  artistText: {
    color: "#e6e6e6",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  albumText: {
    color: "#a8a8a8",
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.1,
  },

  metaControls: { gap: 8 },

  // Bigger + better centered nav icons
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6, // helps center within the metaBox space
    gap: 18,
  },
  iconBtn: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  iconBtnText: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 1 },

  playBtn: {
    width: 82,
    height: 82,
    backgroundColor: "rgba(255,255,255,0.20)",
    borderColor: "rgba(255,255,255,0.26)",
    transform: [{ translateY: -2 }], // visually centers the larger middle button
  },

  // Progress under controls
  progressWrap: { gap: 4 },
  progressTrack: {
    height: 7,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 999 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeText: { color: "#cfcfcf", fontSize: 11 },

  muted: { color: "#9a9a9a" },
});