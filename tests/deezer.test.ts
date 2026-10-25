import { describe, expect, it } from "vitest";
import { chooseDeezerArtist, normalizeTopTracks } from "@/server/providers/deezer";

describe("chooseDeezerArtist", () => {
  it("picks the dominant exact-name artist, not the first search result", () => {
    // Real Deezer results for "MUNA": a small namesake is ranked first.
    const pick = chooseDeezerArtist("MUNA", [
      { id: 134443222, name: "Muna", nb_fan: 14 },
      { id: 5519756, name: "MUNA", nb_fan: 13081 },
      { id: 9092788, name: "Muna", nb_fan: 49 },
      { id: 3574, name: "Lunatic", nb_fan: 174217 },
    ]);
    expect(pick?.id).toBe(5519756);
  });

  it("refuses to guess between similarly popular namesakes", () => {
    expect(chooseDeezerArtist("Phoenix", [{ id: 1, name: "Phoenix", nb_fan: 1000 }, { id: 2, name: "Phoenix", nb_fan: 600 }])).toBeNull();
  });

  it("requires an exact (normalised) name", () => {
    expect(chooseDeezerArtist("Sigur Rós", [{ id: 1, name: "Sigur Ros", nb_fan: 5 }])?.id).toBe(1);
    expect(chooseDeezerArtist("Phoenix", [{ id: 1, name: "Phoenix Foundation", nb_fan: 5000 }])).toBeNull();
  });
});

describe("normalizeTopTracks", () => {
  it("keeps only tracks with an https preview and respects the limit", () => {
    const tracks = normalizeTopTracks(
      [
        { id: 1, title: "No preview", preview: "" },
        { id: 2, title: "One (Remastered)", title_short: "One", preview: "https://cdnt-preview.dzcdn.net/a.mp3", album: { title: "Album", cover_medium: "https://x/c.jpg" }, duration: 200 },
        { id: 3, title: "Two", preview: "http://insecure/b.mp3" },
        { id: 4, title: "Three", preview: "https://cdnt-preview.dzcdn.net/c.mp3" },
        { id: 5, title: "Four", preview: "https://cdnt-preview.dzcdn.net/d.mp3" },
      ],
      2,
    );
    expect(tracks.map((t) => t.title)).toEqual(["One", "Three"]);
    expect(tracks[0]).toMatchObject({ album: "Album", coverUrl: "https://x/c.jpg", durationSec: 200 });
  });
});
