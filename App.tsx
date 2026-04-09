
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  StatusBar as RNStatusBar,
  Platform,
  Animated,
  PanResponder,
  AppState,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import * as NavigationBar from "expo-navigation-bar";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function fmtMs(ms: number) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${pad2(s)}`;
}

const SCREEN_ORDER = ["macros", "spotify", "clock"] as const;
type Screen = (typeof SCREEN_ORDER)[number];
const SCREEN_INDEX: Record<Screen, number> = { macros: 0, spotify: 1, clock: 2 };

const MACRO_CATEGORIES = [
  {
    id: "system",
    label: "SYSTEM",
    accent: "#4a9eff",
    items: [
      { id: "mic-mute", name: "Mute Mic", icon: "mic-off" as const },
      { id: "show-desktop", name: "Desktop", icon: "desktop-windows" as const },
    ],
  },
  {
    id: "desktop",
    label: "VIRTUAL DESKTOP",
    accent: "#a78bfa",
    items: [
      { id: "desktop-left", name: "Desk Left", icon: "arrow-back" as const },
      { id: "desktop-right", name: "Desk Right", icon: "arrow-forward" as const },
    ],
  },
  {
    id: "apps",
    label: "APPS",
    accent: "#34d399",
    items: [
      { id: "open-spotify", name: "Spotify", icon: "music-note" as const },
      { id: "open-discord", name: "Discord", icon: "forum" as const },
      { id: "open-firefox", name: "Firefox", icon: "language" as const },
      { id: "open-vscode", name: "VS Code", icon: "code" as const },
      { id: "open-files", name: "Files", icon: "folder" as const },
    ],
  },
] as const;

export default function App() {
  const [host, setHost] = useState("http://192.168.86.63:3001"); // change this
  const [token, setToken] = useState("changeme");
  const [status, setStatus] = useState("Idle");
  const [data, setData] = useState<any>(null);
  const [activeScreen, setActiveScreen] = useState<Screen>("spotify");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);


  const { width, height } = useWindowDimensions();

  const getScreenTranslateY = useCallback(
    (screen: Screen) => -SCREEN_INDEX[screen] * height,
    [height]
  );

  const screenY = useRef(new Animated.Value(getScreenTranslateY("spotify"))).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeScreenRef = useRef(activeScreen);
  const gestureDirectionRef = useRef<"vertical" | "horizontal" | null>(null);

  const sidebarWidth = Math.min(320, width * 0.45);
  const sidebarTranslateX = useRef(new Animated.Value(sidebarWidth)).current;

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

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
      setStatus(e?.message || "Error");
      setData(null);
    }
  }

  async function post(path: string) {
    try {
      setStatus("Sending...");
      const res = await fetch(`${host}${path}`, { method: "POST", headers });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`);
      }
      await getNowPlaying();
    } catch (e: any) {
      setStatus(e?.message || "Error");
    }
  }

  async function runMacro(id: string) {
    try {
      const clean = String(id ?? "").trim();
      if (!clean) return;

      setStatus("Sending...");
      const res = await fetch(`${host}/macros/run`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ id: clean }),
      });

      const text = await res.text().catch(() => "");

      if (!res.ok) {
        // Keep it quiet: just surface as status text
        setStatus(`HTTP ${res.status} ${text}`);
        return;
      }

      // If server returns { ok:false, error:"..." } show it in status
      try {
        const payload = text ? JSON.parse(text) : {};
        if (payload && payload.ok === false && payload.error) {
          setStatus(String(payload.error));
          return;
        }
      } catch {
        // ignore
      }

      setStatus("OK");
    } catch (e: any) {
      setStatus(e?.message || "Macro run failed");
    }
  }

  useEffect(() => {
    RNStatusBar.setBarStyle("light-content");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, token]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const hideSystemBars = async () => {
      try {
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setVisibilityAsync("hidden");
        RNStatusBar.setHidden(true, "none");
      } catch (error) {
        console.warn("Unable to hide system bars", error);
      }
    };

    hideSystemBars();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") hideSystemBars();
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  useEffect(() => {
    const ticker = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  useEffect(() => {
    Animated.spring(screenY, {
      toValue: getScreenTranslateY(activeScreen),
      useNativeDriver: true,
      speed: 20,
      bounciness: 0,
    }).start();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScreen, getScreenTranslateY, screenY]);

  const screenPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 || Math.abs(g.dx) > 12,
        onPanResponderGrant: () => {
          screenY.stopAnimation();
          gestureDirectionRef.current = null;
        },
        onPanResponderMove: (_, g) => {
          if (!gestureDirectionRef.current) {
            if (Math.abs(g.dy) > Math.abs(g.dx)) gestureDirectionRef.current = "vertical";
            else if (Math.abs(g.dx) > Math.abs(g.dy)) gestureDirectionRef.current = "horizontal";
          }
          if (gestureDirectionRef.current === "vertical") {
            const start = getScreenTranslateY(activeScreenRef.current);
            const minTranslate = getScreenTranslateY(SCREEN_ORDER[SCREEN_ORDER.length - 1]);
            const maxTranslate = getScreenTranslateY(SCREEN_ORDER[0]);
            const next = Math.max(minTranslate, Math.min(maxTranslate, start + g.dy));
            screenY.setValue(next);
          }
        },
        onPanResponderRelease: (_, g) => {
          const direction = gestureDirectionRef.current || "vertical";
          gestureDirectionRef.current = null;
          const swipedVertical = Math.abs(g.dy) > Math.abs(g.dx);
          const currentScreen = activeScreenRef.current;

          const snapBack = () => {
            Animated.spring(screenY, {
              toValue: getScreenTranslateY(currentScreen),
              useNativeDriver: true,
              speed: 20,
              bounciness: 0,
            }).start();
          };

          if (direction === "vertical" && swipedVertical) {
            const currentIndex = SCREEN_INDEX[currentScreen];
            const previousScreen = currentIndex > 0 ? SCREEN_ORDER[currentIndex - 1] : null;
            const nextScreen =
              currentIndex < SCREEN_ORDER.length - 1 ? SCREEN_ORDER[currentIndex + 1] : null;

            if (g.dy > 35 && previousScreen) setActiveScreen(previousScreen);
            else if (g.dy < -35 && nextScreen) setActiveScreen(nextScreen);
            else snapBack();
          } else if (direction === "horizontal") {
            if (g.dx > 35 && currentScreen === "spotify") setSidebarOpen(true);
            else if (g.dx < -35 && sidebarOpen) setSidebarOpen(false);
            else snapBack();
          } else {
            snapBack();
          }
        },
      }),
    [getScreenTranslateY, screenY, sidebarOpen]
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

  const formattedTime = useMemo(
    () =>
      currentTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [currentTime]
  );

  const formattedDate = useMemo(
    () =>
      currentTime.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [currentTime]
  );

  useEffect(() => {
    Animated.spring(sidebarTranslateX, {
      toValue: sidebarOpen ? 0 : sidebarWidth,
      useNativeDriver: true,
      speed: 20,
      bounciness: 0,
    }).start();
  }, [sidebarOpen, sidebarWidth, sidebarTranslateX]);

  const spotifyBackgroundColor = "#000";
  const macrosBackgroundColor = "#000";
  const clockBackgroundColor = "#000";
  const safeBackgroundColor = "#000";

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, { backgroundColor: safeBackgroundColor }]} edges={[]}>
        <StatusBar hidden={true} translucent backgroundColor="transparent" />

        {sidebarOpen && <Pressable style={styles.sidebarOverlay} onPress={() => setSidebarOpen(false)} />}

        <Animated.View
          style={[
            styles.sidebar,
            { width: sidebarWidth, transform: [{ translateX: sidebarTranslateX }] },
          ]}
        >
          <Text style={styles.sidebarTitle}>Menu</Text>
          <Text style={styles.sidebarStatus}>Status: {status}</Text>
          <Text style={styles.sidebarHint}>Swipe left to close</Text>
        </Animated.View>

        <View style={styles.screenViewport} {...screenPanResponder.panHandlers}>
          <Animated.View
            style={[
              styles.screenStack,
              { height: height * SCREEN_ORDER.length, transform: [{ translateY: screenY }] },
            ]}
          >
            {/* Macros screen */}
            <View style={[styles.screen, styles.macrosScreen, { height, backgroundColor: macrosBackgroundColor }]}>
              <Text style={styles.macrosTitle}>Macros</Text>
              <View style={styles.macrosColumns}>
                {/* Left column: System + Virtual Desktop */}
                <View style={styles.macrosLeftCol}>
                  {MACRO_CATEGORIES.filter((c) => c.id !== "apps").map((cat) => (
                    <View key={cat.id} style={styles.macroCategory}>
                      <Text style={[styles.macroCatLabel, { color: cat.accent }]}>{cat.label}</Text>
                      <View style={styles.macroCatRow}>
                        {cat.items.map((item) => (
                          <Pressable
                            key={item.id}
                            style={({ pressed }) => [
                              styles.macroIconTile,
                              { borderColor: pressed ? cat.accent : "rgba(255,255,255,0.10)" },
                              pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
                            ]}
                            onPress={() => runMacro(item.id)}
                          >
                            <MaterialIcons name={item.icon} size={26} color={cat.accent} />
                            <Text style={styles.macroIconTileName}>{item.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>

                {/* Right column: Apps */}
                {MACRO_CATEGORIES.filter((c) => c.id === "apps").map((cat) => (
                  <View key={cat.id} style={styles.macrosRightCol}>
                    <Text style={[styles.macroCatLabel, { color: cat.accent }]}>{cat.label}</Text>
                    <View style={styles.macroAppGrid}>
                      {cat.items.map((item) => (
                        <Pressable
                          key={item.id}
                          style={({ pressed }) => [
                            styles.macroAppTile,
                            { borderColor: pressed ? cat.accent : "rgba(255,255,255,0.10)" },
                            pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
                          ]}
                          onPress={() => runMacro(item.id)}
                        >
                          <MaterialIcons name={item.icon} size={30} color={cat.accent} />
                          <Text style={styles.macroIconTileName}>{item.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Spotify screen */}
            <View style={[styles.screen, { height, backgroundColor: spotifyBackgroundColor }]}>
              <View style={styles.topArea}>
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

                  <View style={styles.controls}>
                    <Pressable style={styles.iconBtn} onPress={() => post("/previous")}>
                      <Text style={styles.iconBtnText}>{"\u23EE"}</Text>
                    </Pressable>

                    <Pressable style={[styles.iconBtn, styles.playBtn]} onPress={() => post("/play-pause")}>
                      <MaterialIcons name={data?.isPlaying ? "pause" : "play-arrow"} size={44} color="#fff" />
                    </Pressable>

                    <Pressable style={styles.iconBtn} onPress={() => post("/next")}>
                      <Text style={styles.iconBtnText}>{"\u23ED"}</Text>
                    </Pressable>
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
              </View>
            </View>

            {/* Clock screen */}
            <View style={[styles.screen, styles.clockScreen, { height, backgroundColor: clockBackgroundColor }]}>
              <View style={styles.clockContent}>
                <Text style={styles.clockTitle}>Current Time</Text>
                <Text style={styles.clockTime}>{formattedTime}</Text>
                <Text style={styles.clockDate}>{formattedDate}</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },

  screenViewport: { flex: 1, overflow: "hidden" },
  screenStack: { width: "100%", flexDirection: "column" },

  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 5,
  },
  sidebar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "#090909",
    borderLeftWidth: 1,
    borderLeftColor: "#1e1e1e",
    padding: 16,
    zIndex: 6,
    justifyContent: "flex-start",
  },
  sidebarTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  sidebarStatus: { color: "#8f8f8f", fontSize: 12, marginBottom: 8 },
  sidebarHint: { color: "#6f6f6f", fontSize: 12 },

  screen: {
    width: "100%",
    paddingHorizontal: 14,
    paddingTop: 30,
    paddingLeft: 35,
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
    backgroundColor: "#05050500",
    borderWidth: 0,
  },
  art: { width: "100%", height: "100%" },
  artPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },

  metaBox: {
    flex: 1.3,
    borderRadius: 16,
    backgroundColor: "#00000000",
    borderWidth: 0,
    paddingVertical: 18,
    paddingHorizontal: 14,
    justifyContent: "center",
    gap: 14,
  },

  metaTextWrap: { gap: 4 },
  title: { color: "#f8f8f8", fontSize: 24, fontWeight: "800", lineHeight: 28, letterSpacing: 0.2 },
  artistText: { color: "#e6e6e6", fontSize: 15, fontWeight: "600", letterSpacing: 0.15 },
  albumText: { color: "#a8a8a8", fontSize: 13, fontWeight: "500", letterSpacing: 0.1 },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
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
    backgroundColor: "rgba(255,255,255,0.2)",
    borderColor: "rgba(255,255,255,0.26)",
    transform: [{ translateY: -2 }],
  },

  progressWrap: { gap: 4 },
  progressTrack: { height: 7, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 999 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeText: { color: "#cfcfcf", fontSize: 11 },

  muted: { color: "#9a9a9a" },

  macrosScreen: {
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: 28,
    paddingBottom: 16,
  },
  macrosTitle: { color: "#fff", fontSize: 30, fontWeight: "800", letterSpacing: 0.6, marginBottom: 14 },

  macrosColumns: { flex: 1, flexDirection: "row", gap: 20, width: "100%", paddingRight: 14 },
  macrosLeftCol: { flex: 1, gap: 16 },
  macrosRightCol: { flex: 1.4 },

  macroCategory: { gap: 8 },
  macroCatLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  macroCatRow: { flexDirection: "row", gap: 10 },

  macroIconTile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  macroIconTileName: { color: "#e0e0e0", fontSize: 12, fontWeight: "600", textAlign: "center" },

  macroAppGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  macroAppTile: {
    width: 90,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },

  clockScreen: {
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingTop: 56,
    paddingBottom: 50,
  },
  clockContent: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center", gap: 16 },
  clockTitle: { color: "#9b9b9b", fontSize: 16, letterSpacing: 2 },
  clockTime: { color: "#fff", fontSize: 72, fontWeight: "700", letterSpacing: 1 },
  clockDate: { color: "#b7b7b7", fontSize: 18 },
});
