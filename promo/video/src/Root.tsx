import {Composition,Folder} from 'remotion';
import {Promo} from './Promo';
import {Opening} from './Opening';
import {Cargo} from './Cargo';
import {Movement} from './Movement';
import {Specifications} from './Specifications';
import {Container} from './Container';
import {Unloading} from './Unloading';
import {Closing} from './Closing';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="RealLoad-Promo" component={Promo} durationInFrames={1800} fps={30} width={1920} height={1080}/>
      <Folder name="Scenes">
        <Composition id="Opening" component={Opening} durationInFrames={180} fps={30} width={1920} height={1080}/>
        <Composition id="Cargo" component={Cargo} durationInFrames={240} fps={30} width={1920} height={1080}/>
        <Composition id="Movement" component={Movement} durationInFrames={270} fps={30} width={1920} height={1080}/>
        <Composition id="Specifications" component={Specifications} durationInFrames={330} fps={30} width={1920} height={1080}/>
        <Composition id="Container" component={Container} durationInFrames={270} fps={30} width={1920} height={1080}/>
        <Composition id="Unloading" component={Unloading} durationInFrames={300} fps={30} width={1920} height={1080}/>
        <Composition id="Closing" component={Closing} durationInFrames={210} fps={30} width={1920} height={1080}/>
      </Folder>
    </>
  );
};
