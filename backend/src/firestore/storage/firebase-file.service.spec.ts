import { FirebaseFileService, downloadUrl } from './firebase-file.service';

describe('downloadUrl', () => {
  const oldEnv = { ...process.env };
  afterEach(() => { process.env = { ...oldEnv }; });

  it('builds a Firebase download-token link with the key URL-encoded', () => {
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    expect(downloadUrl('my-bucket', 'shop1_17_ab.jpg', 'tok-1')).toBe('https://firebasestorage.googleapis.com/v0/b/my-bucket/o/shop1_17_ab.jpg?alt=media&token=tok-1');
    expect(downloadUrl('b', 'a/b c.png', 't')).toContain('/o/a%2Fb%20c.png?alt=media');
  });

  it('points at the emulator when one is configured', () => {
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
    expect(downloadUrl('b', 'k.jpg', 't')).toBe('http://127.0.0.1:9199/v0/b/b/o/k.jpg?alt=media&token=t');
  });
});

describe('FirebaseFileService.uploadFile', () => {
  function serviceWithBucket() {
    const saved: any[] = [];
    const bucket = { name: 'test-bucket', file: (key: string) => ({ save: async (buf: Buffer, opts: any) => { saved.push({ key, buf, opts }); }, getSignedUrl: () => { throw new Error('signed URLs must not be used'); } }) };
    const svc = new FirebaseFileService();
    jest.spyOn(svc as any, 'bucket', 'get').mockReturnValue(bucket);
    return { svc, saved };
  }

  it('stores a download token in the object metadata and returns the matching link - without ever signing a URL', async () => {
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    const { svc, saved } = serviceWithBucket();
    const out = await svc.uploadFile('photo one.JPG', Buffer.from('x'), 'shop-9');
    expect(saved).toHaveLength(1);
    const token = saved[0].opts.metadata.metadata.firebaseStorageDownloadTokens;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved[0].opts.contentType).toBe('image/jpeg');
    expect(out.fileKey).toMatch(/^shop9_\d+_[a-z0-9]+\.JPG$/);
    expect(out.fileUrl).toBe(`https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${out.fileKey}?alt=media&token=${token}`);
  });

  it('gives every upload its own token', async () => {
    const { svc, saved } = serviceWithBucket();
    await svc.uploadFile('a.png', Buffer.from('1'), 's');
    await svc.uploadLongLivedFile('b.png', Buffer.from('2'), 's');
    const tokens = saved.map((s) => s.opts.metadata.metadata.firebaseStorageDownloadTokens);
    expect(new Set(tokens).size).toBe(2);
  });
});
