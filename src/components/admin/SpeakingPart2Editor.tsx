import { useCallback, useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor } from './RichTextEditor';
import { Info, Upload, Trash2, Volume2, Wand2, Loader2, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/lib/r2Upload';
import { compressAudio } from '@/utils/audioCompressor';

export interface SpeakingPart2Data {
  cue_card_topic: string;
  cue_card_content: string;
  preparation_time_seconds: number;
  speaking_time_seconds: number;
  cue_card_audio_url?: string | null;
}

interface SpeakingPart2EditorProps {
  data: SpeakingPart2Data;
  onUpdate: (updates: Partial<SpeakingPart2Data>) => void;
  testId?: string;
}

export function SpeakingPart2Editor({ data, onUpdate, testId }: SpeakingPart2EditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdate = useCallback((field: keyof SpeakingPart2Data, value: string | number | null) => {
    onUpdate({ [field]: value });
  }, [onUpdate]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      toast.error('Please select an audio file');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      setUploadProgress(20);
      let fileToUpload: File = file;
      
      try {
        const compressedFile = await compressAudio(file);
        fileToUpload = compressedFile;
        setUploadProgress(50);
        toast.info(`Compressed to ${(compressedFile.size / 1024).toFixed(0)}KB`);
      } catch (compressError) {
        console.warn('Compression failed, uploading original:', compressError);
        setUploadProgress(50);
      }

      const uniqueId = testId || `part2-${Date.now()}`;
      const result = await uploadToR2({
        file: fileToUpload,
        folder: 'speaking-questions/part2-cuecard',
        fileName: `${uniqueId}.mp3`,
        onProgress: (p) => setUploadProgress(50 + p * 0.5),
      });

      if (result.success && result.url) {
        handleUpdate('cue_card_audio_url', result.url);
        toast.success('Cue card audio uploaded successfully');
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateAudio = async () => {
    const textToSpeak = data.cue_card_topic && data.cue_card_content 
      ? `${data.cue_card_topic}. ${data.cue_card_content}`
      : data.cue_card_topic || data.cue_card_content;

    if (!textToSpeak?.trim()) {
      toast.error('Cue card topic or content is required to generate audio');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(10);

    try {
      setGenerationProgress(30);
      const uniqueId = testId || `part2-${Date.now()}`;
      
      const { data: responseData, error } = await supabase.functions.invoke('generate-gemini-tts', {
        body: {
          items: [{ key: uniqueId, text: textToSpeak }],
          // Server enforces unified voice, but keep this aligned for clarity.
          voiceName: 'Charon',
          directory: 'speaking-questions/part2-cuecard',
        },
      });

      setGenerationProgress(80);

      if (error) {
        throw error;
      }

      if (!responseData?.success || !responseData?.clips?.length) {
        throw new Error(responseData?.error || 'No audio generated');
      }

      const clip = responseData.clips[0];
      
      if (clip.url) {
        handleUpdate('cue_card_audio_url', clip.url);
        toast.success('Cue card audio generated and uploaded successfully');
      } else if (clip.audioBase64) {
        toast.warning('Audio generated but upload failed. Please try uploading manually.');
      } else {
        throw new Error('No audio URL returned');
      }

      setGenerationProgress(100);
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(`Generation failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleRemoveAudio = () => {
    handleUpdate('cue_card_audio_url', null);
    toast.info('Cue card audio removed');
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Part 2: Individual Long Turn (Cue Card)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Cue Card Topic</Label>
              <Input
                value={data.cue_card_topic}
                onChange={(e) => handleUpdate('cue_card_topic', e.target.value)}
                placeholder="e.g., Describe a time you helped someone."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Full Cue Card Content
                <Tooltip>
                  <TooltipTrigger>
                    <Info size={14} className="text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Include the main instruction and bullet points. Use `•` for bullet points.</p>
                    <p className="mt-1">Example: "You should say: • What it was • When it happened • Why it was memorable..."</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <RichTextEditor
                value={data.cue_card_content}
                onChange={(value) => handleUpdate('cue_card_content', value)}
                placeholder="Enter the full cue card content with bullet points..."
                rows={6}
              />
            </div>

            {/* Cue Card Audio Section */}
            <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Volume2 size={14} />
                  Cue Card Audio (Examiner Voice)
                </Label>
                {data.cue_card_audio_url && (
                  <Badge variant="outline" className="text-xs bg-success/10 text-success">
                    <Check size={12} className="mr-1" />
                    Audio Set
                  </Badge>
                )}
              </div>

              {data.cue_card_audio_url ? (
                <div className="space-y-2">
                  <audio controls src={data.cue_card_audio_url} className="w-full h-8" preload="metadata" />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isGenerating}
                    >
                      <Upload size={14} className="mr-1" />
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateAudio}
                      disabled={isUploading || isGenerating}
                    >
                      {isGenerating ? (
                        <Loader2 size={14} className="mr-1 animate-spin" />
                      ) : (
                        <Wand2 size={14} className="mr-1" />
                      )}
                      Regenerate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveAudio}
                      disabled={isUploading || isGenerating}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isGenerating}
                      className="flex-1"
                    >
                      {isUploading ? (
                        <Loader2 size={14} className="mr-1 animate-spin" />
                      ) : (
                        <Upload size={14} className="mr-1" />
                      )}
                      Upload Audio
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleGenerateAudio}
                      disabled={isUploading || isGenerating || (!data.cue_card_topic?.trim() && !data.cue_card_content?.trim())}
                      className="flex-1"
                    >
                      {isGenerating ? (
                        <Loader2 size={14} className="mr-1 animate-spin" />
                      ) : (
                        <Wand2 size={14} className="mr-1" />
                      )}
                      Generate AI Audio
                    </Button>
                  </div>

                  {(isUploading || isGenerating) && (
                    <Progress value={isUploading ? uploadProgress : generationProgress} className="h-1" />
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preparation Time (seconds)</Label>
                <Select
                  value={String(data.preparation_time_seconds)}
                  onValueChange={(value) => handleUpdate('preparation_time_seconds', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="45">45 seconds</SelectItem>
                    <SelectItem value="60">60 seconds (Default)</SelectItem>
                    <SelectItem value="75">75 seconds</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Speaking Time (seconds)</Label>
                <Select
                  value={String(data.speaking_time_seconds)}
                  onValueChange={(value) => handleUpdate('speaking_time_seconds', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">90 seconds (1.5 min)</SelectItem>
                    <SelectItem value="120">120 seconds (2 min - Default)</SelectItem>
                    <SelectItem value="150">150 seconds (2.5 min)</SelectItem>
                    <SelectItem value="180">180 seconds (3 min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}