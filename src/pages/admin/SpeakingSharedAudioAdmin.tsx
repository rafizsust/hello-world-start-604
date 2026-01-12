import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Volume2, Upload, Trash2, Play, Pause, Save, RefreshCw, Sparkles, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface SharedAudio {
  id: string;
  audio_key: string;
  audio_url: string | null;
  fallback_text: string;
  description: string | null;
  display_order: number;
}

export default function SpeakingSharedAudioAdmin() {
  const [audioItems, setAudioItems] = useState<SharedAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchAudioItems();
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
    };
  }, []);

  const fetchAudioItems = async () => {
    try {
      const { data, error } = await supabase
        .from('speaking_shared_audio')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setAudioItems(data || []);
    } catch (error) {
      console.error('Error fetching shared audio:', error);
      toast.error('Failed to load shared audio settings');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (item: SharedAudio, file: File) => {
    if (!file.type.startsWith('audio/')) {
      toast.error('Please upload an audio file');
      return;
    }

    setUploading(item.id);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `shared/${item.audio_key}.${fileExt}`;

      // Delete old file if exists
      if (item.audio_url) {
        const oldPath = item.audio_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('speaking-audios').remove([`shared/${oldPath}`]);
        }
      }

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from('speaking-audios')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('speaking-audios')
        .getPublicUrl(fileName);

      // Update database
      const { error: updateError } = await supabase
        .from('speaking_shared_audio')
        .update({ audio_url: urlData.publicUrl })
        .eq('id', item.id);

      if (updateError) throw updateError;

      // Update local state
      setAudioItems(prev => prev.map(a => 
        a.id === item.id ? { ...a, audio_url: urlData.publicUrl } : a
      ));

      toast.success('Audio uploaded successfully');
    } catch (error) {
      console.error('Error uploading audio:', error);
      toast.error('Failed to upload audio file');
    } finally {
      setUploading(null);
    }
  };

  const handleGenerateAudio = async (item: SharedAudio) => {
    if (!item.fallback_text.trim()) {
      toast.error('Please enter text to generate audio from');
      return;
    }

    setGenerating(item.id);
    try {
      const { data, error } = await supabase.functions.invoke('generate-gemini-tts', {
        body: {
          items: [{ key: item.audio_key, text: item.fallback_text }],
          directory: 'shared-speaking',
          adminMode: true, // Use admin API key pool
        },
      });

      if (error) throw error;

      if (!data?.clips?.[0]?.url) {
        throw new Error('No audio URL returned from TTS generation');
      }

      const audioUrl = data.clips[0].url;

      // Update database
      const { error: updateError } = await supabase
        .from('speaking_shared_audio')
        .update({ audio_url: audioUrl })
        .eq('id', item.id);

      if (updateError) throw updateError;

      // Update local state
      setAudioItems(prev => prev.map(a => 
        a.id === item.id ? { ...a, audio_url: audioUrl } : a
      ));

      toast.success('Audio generated successfully');
    } catch (error: any) {
      console.error('Error generating audio:', error);
      toast.error(error.message || 'Failed to generate audio');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateAllMissing = async () => {
    const missingItems = audioItems.filter(item => !item.audio_url && item.fallback_text.trim());
    
    if (missingItems.length === 0) {
      toast.info('All items already have audio files');
      return;
    }

    setGeneratingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-gemini-tts', {
        body: {
          items: missingItems.map(item => ({ key: item.audio_key, text: item.fallback_text })),
          directory: 'shared-speaking',
          adminMode: true,
        },
      });

      if (error) throw error;

      if (!data?.clips?.length) {
        throw new Error('No audio returned from TTS generation');
      }

      // Update database for each generated clip
      for (const clip of data.clips) {
        if (clip.url) {
          const item = missingItems.find(i => i.audio_key === clip.key);
          if (item) {
            await supabase
              .from('speaking_shared_audio')
              .update({ audio_url: clip.url })
              .eq('id', item.id);
          }
        }
      }

      // Refresh data
      await fetchAudioItems();

      toast.success(`Generated ${data.clips.length} audio files`);
    } catch (error: any) {
      console.error('Error generating all audio:', error);
      toast.error(error.message || 'Failed to generate audio files');
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleRegenerateAll = async () => {
    const itemsWithText = audioItems.filter(item => item.fallback_text.trim());
    
    if (itemsWithText.length === 0) {
      toast.info('No items with text to regenerate');
      return;
    }

    if (!confirm(`This will regenerate ALL ${itemsWithText.length} audio files with the unified male voice (Charon). Continue?`)) {
      return;
    }

    setGeneratingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-gemini-tts', {
        body: {
          items: itemsWithText.map(item => ({ key: item.audio_key, text: item.fallback_text })),
          directory: 'shared-speaking',
          adminMode: true,
        },
      });

      if (error) throw error;

      if (!data?.clips?.length) {
        throw new Error('No audio returned from TTS generation');
      }

      for (const clip of data.clips) {
        if (clip.url) {
          const item = itemsWithText.find(i => i.audio_key === clip.key);
          if (item) {
            await supabase
              .from('speaking_shared_audio')
              .update({ audio_url: clip.url })
              .eq('id', item.id);
          }
        }
      }

      await fetchAudioItems();
      toast.success(`Regenerated ${data.clips.length} audio files with unified male voice (Charon)`);
    } catch (error: any) {
      console.error('Error regenerating all audio:', error);
      toast.error(error.message || 'Failed to regenerate audio files');
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleDeleteAudio = async (item: SharedAudio) => {
    if (!item.audio_url) return;
    
    if (!confirm('Are you sure you want to delete this audio file?')) return;

    try {
      // Extract file path from URL - handle both Supabase Storage and R2 URLs
      if (item.audio_url.includes('speaking-audios')) {
        const urlParts = item.audio_url.split('/');
        const fileName = urlParts.slice(-2).join('/');
        await supabase.storage.from('speaking-audios').remove([fileName]);
      }
      // Note: R2-hosted files (from Gemini TTS) are not deleted here - they will be overwritten on regeneration

      // Update database
      const { error: updateError } = await supabase
        .from('speaking_shared_audio')
        .update({ audio_url: null })
        .eq('id', item.id);

      if (updateError) throw updateError;

      // Update local state
      setAudioItems(prev => prev.map(a => 
        a.id === item.id ? { ...a, audio_url: null } : a
      ));

      toast.success('Audio deleted');
    } catch (error) {
      console.error('Error deleting audio:', error);
      toast.error('Failed to delete audio file');
    }
  };

  const handleUpdateFallbackText = async (item: SharedAudio, newText: string) => {
    setSaving(item.id);
    try {
      const { error } = await supabase
        .from('speaking_shared_audio')
        .update({ fallback_text: newText })
        .eq('id', item.id);

      if (error) throw error;

      setAudioItems(prev => prev.map(a => 
        a.id === item.id ? { ...a, fallback_text: newText } : a
      ));

      toast.success('Fallback text updated');
    } catch (error) {
      console.error('Error updating fallback text:', error);
      toast.error('Failed to update fallback text');
    } finally {
      setSaving(null);
    }
  };

  const stopAndCleanupAudio = (audio: HTMLAudioElement) => {
    // Detach handlers first so our own stop doesn't trigger onerror UI.
    audio.onended = null;
    audio.onerror = null;

    try {
      audio.pause();
      // Reset to start so next play always works.
      audio.currentTime = 0;
    } catch {
      // ignore
    }

    // IMPORTANT: Do NOT blank out src here.
    // Clearing src while a play() promise is pending can cause "Failed to play audio" toasts.
  };

  const playAudio = (item: SharedAudio) => {
    // Toggle off
    if (playingAudio === item.id) {
      if (audioElement) stopAndCleanupAudio(audioElement);
      setPlayingAudio(null);
      setAudioElement(null);
      return;
    }

    // Stop any currently playing audio
    if (audioElement) stopAndCleanupAudio(audioElement);

    if (item.audio_url) {
      const audio = new Audio(item.audio_url);

      audio.onended = () => {
        setPlayingAudio(null);
        setAudioElement(null);
      };

      audio.onerror = () => {
        toast.error('Failed to play audio');
        setPlayingAudio(null);
        setAudioElement(null);
      };

      // Set state immediately so rapid pause/stop doesn't cause "play() interrupted" errors to surface as failures.
      setAudioElement(audio);
      setPlayingAudio(item.id);

      audio.play().catch((err: any) => {
        const msg = String(err?.message || err);
        // Ignore common benign cases when user clicks play then immediately stops.
        if (err?.name === 'AbortError' || msg.toLowerCase().includes('interrupted')) {
          return;
        }
        toast.error('Failed to play audio');
        setPlayingAudio(null);
        setAudioElement(null);
      });
    } else {
      // Use TTS fallback
      const utterance = new SpeechSynthesisUtterance(item.fallback_text);
      utterance.onend = () => setPlayingAudio(null);
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
      setPlayingAudio(item.id);
    }
  };

  const getPartColor = (audioKey: string) => {
    if (audioKey.startsWith('part1')) return 'bg-blue-500/10 text-blue-600 border-blue-200';
    if (audioKey.startsWith('part2')) return 'bg-green-500/10 text-green-600 border-green-200';
    if (audioKey.startsWith('part3')) return 'bg-purple-500/10 text-purple-600 border-purple-200';
    return 'bg-orange-500/10 text-orange-600 border-orange-200';
  };

  const missingAudioCount = audioItems.filter(item => !item.audio_url).length;

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="animate-spin" size={16} />
          Loading shared audio settings...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-heading">Shared Speaking Audio</h1>
        <p className="text-muted-foreground">
          Manage common audio files used across all Cambridge speaking tests (introductions, transitions, endings).
        </p>
      </div>

      {/* Info Alert explaining purpose */}
      <Alert className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-700 dark:text-blue-400">Why Shared Audio?</AlertTitle>
        <AlertDescription className="text-blue-600 dark:text-blue-300">
          These audio files are shared across ALL speaking tests to save storage and API costs. 
          During a test, the system plays: <strong>Shared intro → Test-specific questions → Shared transitions → Test-specific questions → Shared endings</strong>.
          If no audio is uploaded, the browser's TTS will read the fallback text instead.
        </AlertDescription>
      </Alert>

      {/* Generate All / Regenerate All Button */}
      <div className="mb-6 flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <div>
          {missingAudioCount > 0 ? (
            <>
              <p className="font-medium text-amber-700 dark:text-amber-400">
                {missingAudioCount} audio file{missingAudioCount > 1 ? 's' : ''} missing
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Generate all missing audio files using Gemini TTS (unified male voice: Charon)
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-green-700 dark:text-green-400">
                All audio files ready
              </p>
              <p className="text-sm text-green-600 dark:text-green-500">
                Regenerate all to update voice (uses unified male voice: Charon)
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {missingAudioCount > 0 && (
            <Button 
              onClick={handleGenerateAllMissing}
              disabled={generatingAll}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {generatingAll ? (
                <><RefreshCw size={14} className="mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles size={14} className="mr-2" /> Generate Missing</>
              )}
            </Button>
          )}
          <Button 
            onClick={handleRegenerateAll}
            disabled={generatingAll || audioItems.length === 0}
            variant="outline"
          >
            {generatingAll ? (
              <><RefreshCw size={14} className="mr-2 animate-spin" /> Regenerating...</>
            ) : (
              <><RefreshCw size={14} className="mr-2" /> Regenerate All</>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {audioItems.map((item) => (
          <Card key={item.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getPartColor(item.audio_key)}>
                    {item.audio_key}
                  </Badge>
                  <CardTitle className="text-base">{item.description}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {item.audio_url ? (
                    <Badge variant="default" className="bg-green-600">
                      <Volume2 size={12} className="mr-1" />
                      Audio Ready
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      TTS Fallback Only
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Audio Controls */}
              <div className="flex items-center gap-3">
                <Label className="w-24 shrink-0">Audio File:</Label>
                <div className="flex-1 flex items-center gap-2">
                  {item.audio_url ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => playAudio(item)}
                      >
                        {playingAudio === item.id ? (
                          <><Pause size={14} className="mr-1" /> Stop</>
                        ) : (
                          <><Play size={14} className="mr-1" /> Play</>
                        )}
                      </Button>
                      <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {item.audio_url.split('/').pop()?.slice(0, 20)}...
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAudio(item)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">No audio uploaded</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Generate/Regenerate Button */}
                  <Button
                    variant={item.audio_url ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleGenerateAudio(item)}
                    disabled={generating === item.id || !item.fallback_text.trim()}
                    className={item.audio_url ? "" : "bg-primary"}
                  >
                    {generating === item.id ? (
                      <><RefreshCw size={14} className="mr-1 animate-spin" /> Generating...</>
                    ) : item.audio_url ? (
                      <><RefreshCw size={14} className="mr-1" /> Regenerate</>
                    ) : (
                      <><Sparkles size={14} className="mr-1" /> Generate</>
                    )}
                  </Button>
                  
                  {/* Upload Button */}
                  <Input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    id={`upload-${item.id}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(item, file);
                      e.target.value = '';
                    }}
                    disabled={uploading === item.id}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    disabled={uploading === item.id}
                  >
                    <label htmlFor={`upload-${item.id}`} className="cursor-pointer">
                      {uploading === item.id ? (
                        <><RefreshCw size={14} className="mr-1 animate-spin" /> Uploading...</>
                      ) : (
                        <><Upload size={14} className="mr-1" /> Upload</>
                      )}
                    </label>
                  </Button>
                </div>
              </div>

              {/* Fallback Text */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>TTS Fallback Text:</Label>
                  {!item.audio_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => playAudio(item)}
                    >
                      {playingAudio === item.id ? (
                        <><Pause size={14} className="mr-1" /> Stop</>
                      ) : (
                        <><Volume2 size={14} className="mr-1" /> Preview TTS</>
                      )}
                    </Button>
                  )}
                </div>
                <Textarea
                  value={item.fallback_text}
                  onChange={(e) => {
                    setAudioItems(prev => prev.map(a => 
                      a.id === item.id ? { ...a, fallback_text: e.target.value } : a
                    ));
                  }}
                  rows={2}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateFallbackText(item, item.fallback_text)}
                  disabled={saving === item.id}
                >
                  {saving === item.id ? (
                    <><RefreshCw size={14} className="mr-1 animate-spin" /> Saving...</>
                  ) : (
                    <><Save size={14} className="mr-1" /> Save Text</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
