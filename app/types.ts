export interface IUser {
   age: number
   description: string
   id: number
   image: string
   lat: number | null
   lng: number | null
   name: string
   sex: 'male' | 'female';
   thoughts: string
}

export interface ISelf extends IUser{
   email: string
   is_online: 0 | 1
   last_time_online: string
}

export interface IMessage {
   created_at: string;
   id: number;
   is_read: 0 | 1;
   message_text: string;
   receiver_id: number;
   sender_id: number;
}

export interface WroteUser extends IUser {
   is_online: 0 | 1;
   last_time_online: string;
}

export type MessagesByUserId = {
   [userId: string]: IMessage[];
};

export type WroteUserObj = {
   [userId: string]: WroteUser;
}

export interface IReceiveGetMessages {
   messages: MessagesByUserId,
   users: WroteUserObj
}

export interface IFixedRegion {
   latitude: number,
   longitude: number,
   latitudeDelta: number,
   longitudeDelta: number,
} {}